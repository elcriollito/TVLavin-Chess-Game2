/**
 * Vercel Serverless Function: /api/mentor/chat
 *
 * Proxies LLM API calls to avoid CORS issues in the browser.
 * Supports: Together.ai, Meta Llama, OpenAI, Anthropic, Local, Custom
 *
 * Features:
 * - Shared API mode (uses server-side Together.ai key when user doesn't provide one)
 * - Rate limiting for shared API users (protects costs)
 * - BYO API key mode (no rate limits)
 */

// Allowed providers for validation
const ALLOWED_PROVIDERS = ['together', 'llama', 'openai', 'anthropic', 'local', 'custom'];

// Input validation limits
const MAX_MESSAGES = 50;
const MAX_CONTENT_LENGTH = 100000; // 100KB per message

// API base URLs (can be overridden via env vars)
const LLAMA_API_BASE_URL = process.env.LLAMA_API_BASE_URL || 'https://api.llama.com';
const TOGETHER_API_BASE_URL = process.env.TOGETHER_API_BASE_URL || 'https://api.together.xyz';

// Shared API configuration
const SHARED_API_KEY = process.env.TOGETHER_API_KEY; // Server-side only, never sent to client
const SHARED_API_MODEL = 'meta-llama/Llama-3.3-70B-Instruct-Turbo';
const SHARED_API_ENABLED = !!SHARED_API_KEY;

// Rate limiting configuration for shared API users
const RATE_LIMIT = {
  windowMs: 10 * 60 * 1000,    // 10 minutes
  maxRequestsPerWindow: 10,    // 10 requests per 10 minutes per IP
  dailyMaxRequests: 30,        // 30 requests per day per session
  dailyWindowMs: 24 * 60 * 60 * 1000
};

// In-memory rate limit store (resets on cold start - acceptable for serverless)
// For production at scale, use Vercel KV or Upstash Redis
const rateLimitStore = new Map();

/**
 * Get client IP from request (handles proxies)
 */
function getClientIP(req) {
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) {
    return forwarded.split(',')[0].trim();
  }
  return req.headers['x-real-ip'] || req.socket?.remoteAddress || 'unknown';
}

/**
 * Get or create session ID from cookie
 */
function getSessionId(req, res) {
  const cookies = req.headers.cookie || '';
  const sessionMatch = cookies.match(/caissa_session=([^;]+)/);

  if (sessionMatch) {
    return sessionMatch[1];
  }

  // Generate new session ID
  const newSessionId = `sess_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

  // Set cookie (httpOnly, secure in production)
  res.setHeader('Set-Cookie', `caissa_session=${newSessionId}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${60 * 60 * 24 * 30}`);

  return newSessionId;
}

/**
 * Check rate limit for shared API users
 * Returns { allowed: boolean, reason?: string, remaining?: number }
 */
function checkRateLimit(ip, sessionId) {
  const now = Date.now();
  const ipKey = `ip:${ip}`;
  const sessionKey = `session:${sessionId}`;

  // Clean up old entries periodically
  if (Math.random() < 0.1) { // 10% chance to clean
    cleanupRateLimitStore(now);
  }

  // Check IP-based rate limit (10 requests per 10 minutes)
  const ipData = rateLimitStore.get(ipKey) || { requests: [], dailyRequests: [] };
  const recentIpRequests = ipData.requests.filter(t => now - t < RATE_LIMIT.windowMs);

  if (recentIpRequests.length >= RATE_LIMIT.maxRequestsPerWindow) {
    const oldestRequest = Math.min(...recentIpRequests);
    const resetIn = Math.ceil((oldestRequest + RATE_LIMIT.windowMs - now) / 1000 / 60);
    return {
      allowed: false,
      reason: `Rate limit exceeded. Try again in ${resetIn} minutes, or add your own API key for unlimited access.`,
      retryAfter: resetIn * 60
    };
  }

  // Check session-based daily limit (30 requests per day)
  const sessionData = rateLimitStore.get(sessionKey) || { dailyRequests: [] };
  const todaySessionRequests = sessionData.dailyRequests.filter(t => now - t < RATE_LIMIT.dailyWindowMs);

  if (todaySessionRequests.length >= RATE_LIMIT.dailyMaxRequests) {
    return {
      allowed: false,
      reason: `Daily limit reached (${RATE_LIMIT.dailyMaxRequests} requests). Add your own API key for unlimited access.`,
      retryAfter: 86400 // 24 hours
    };
  }

  // Update rate limit data
  ipData.requests = [...recentIpRequests, now];
  sessionData.dailyRequests = [...todaySessionRequests, now];

  rateLimitStore.set(ipKey, ipData);
  rateLimitStore.set(sessionKey, sessionData);

  return {
    allowed: true,
    remaining: {
      window: RATE_LIMIT.maxRequestsPerWindow - ipData.requests.length,
      daily: RATE_LIMIT.dailyMaxRequests - sessionData.dailyRequests.length
    }
  };
}

/**
 * Clean up old rate limit entries
 */
function cleanupRateLimitStore(now) {
  for (const [key, data] of rateLimitStore.entries()) {
    if (key.startsWith('ip:')) {
      data.requests = data.requests.filter(t => now - t < RATE_LIMIT.windowMs);
      if (data.requests.length === 0) {
        rateLimitStore.delete(key);
      }
    } else if (key.startsWith('session:')) {
      data.dailyRequests = data.dailyRequests.filter(t => now - t < RATE_LIMIT.dailyWindowMs);
      if (data.dailyRequests.length === 0) {
        rateLimitStore.delete(key);
      }
    }
  }
}

export default async function handler(req, res) {
  // Only accept POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Enable CORS for local development
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // Handle preflight
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    const { provider, apiKey, messages, model, maxTokens, temperature, endpoint } = req.body;

    // Determine if using shared API or BYO key
    const isUsingSharedApi = !apiKey && provider === 'together' && SHARED_API_ENABLED;
    const isByoKey = !!apiKey;

    // Validate provider
    if (!ALLOWED_PROVIDERS.includes(provider)) {
      return res.status(400).json({
        error: `Unknown provider: ${provider}. Allowed: ${ALLOWED_PROVIDERS.join(', ')}`
      });
    }

    // API key required for non-local providers (unless using shared API)
    if (provider !== 'local' && !apiKey && !isUsingSharedApi) {
      return res.status(400).json({
        error: 'API key is required. Add your own key or use Together.ai with the shared API.',
        sharedApiAvailable: SHARED_API_ENABLED
      });
    }

    if (!messages || !Array.isArray(messages)) {
      return res.status(400).json({ error: 'Messages array is required' });
    }

    // Validate message count
    if (messages.length > MAX_MESSAGES) {
      return res.status(400).json({ error: `Too many messages. Maximum: ${MAX_MESSAGES}` });
    }

    // Validate message content length
    for (const msg of messages) {
      if (msg.content && msg.content.length > MAX_CONTENT_LENGTH) {
        return res.status(400).json({
          error: `Message content too long. Maximum: ${MAX_CONTENT_LENGTH} characters`
        });
      }
    }

    // Rate limiting for shared API users only
    if (isUsingSharedApi) {
      const clientIP = getClientIP(req);
      const sessionId = getSessionId(req, res);
      const rateLimitResult = checkRateLimit(clientIP, sessionId);

      if (!rateLimitResult.allowed) {
        return res.status(429).json({
          error: rateLimitResult.reason,
          retryAfter: rateLimitResult.retryAfter,
          code: 'RATE_LIMITED'
        });
      }

      // Add rate limit headers
      res.setHeader('X-RateLimit-Remaining-Window', rateLimitResult.remaining.window);
      res.setHeader('X-RateLimit-Remaining-Daily', rateLimitResult.remaining.daily);
    }

    // Extract engineReport for logging (client includes it in prompt already)
    const { engineReport } = req.body;
    const hasEngine = engineReport && (engineReport.evalCp !== undefined || engineReport.mateIn !== undefined);

    // Determine which API key to use (NEVER log the actual key)
    const effectiveApiKey = isUsingSharedApi ? SHARED_API_KEY : apiKey;
    const effectiveModel = isUsingSharedApi ? SHARED_API_MODEL : model;

    // Log request (without sensitive data)
    console.log(`🤖 Mentor Chat: provider=${provider}, model=${effectiveModel}, messages=${messages.length}, engineBacked=${hasEngine}, shared=${isUsingSharedApi}, temp=${temperature || 0.7}`);

    let apiUrl, headers, requestBody;

    // Configure request based on provider
    switch (provider) {
      case 'together':
        // Together.ai - cost-efficient LLaMA hosting
        apiUrl = `${TOGETHER_API_BASE_URL}/v1/chat/completions`;
        headers = {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${effectiveApiKey}`
        };
        requestBody = JSON.stringify({
          model: effectiveModel || 'meta-llama/Llama-3.3-70B-Instruct-Turbo',
          messages,
          max_tokens: maxTokens || 1024,
          temperature: temperature || 0.7
        });
        break;

      case 'llama':
        // Meta Llama API - OpenAI-compatible chat completions format
        apiUrl = `${LLAMA_API_BASE_URL}/v1/chat/completions`;
        headers = {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${effectiveApiKey}`
        };
        requestBody = JSON.stringify({
          model: effectiveModel || 'llama-4-scout-17b-16e-instruct',
          messages,
          max_completion_tokens: maxTokens || 1024,
          temperature: temperature || 0.7
        });
        break;

      case 'anthropic':
        apiUrl = 'https://api.anthropic.com/v1/messages';
        headers = {
          'Content-Type': 'application/json',
          'x-api-key': effectiveApiKey,
          'anthropic-version': '2023-06-01'
        };
        // Convert OpenAI format to Anthropic format
        const systemMsg = messages.find(m => m.role === 'system');
        const otherMsgs = messages.filter(m => m.role !== 'system');
        requestBody = JSON.stringify({
          model: effectiveModel || 'claude-sonnet-4-20250514',
          max_tokens: maxTokens || 1024,
          system: systemMsg ? systemMsg.content : '',
          messages: otherMsgs
        });
        break;

      case 'local':
        apiUrl = 'http://localhost:1234/v1/chat/completions';
        headers = { 'Content-Type': 'application/json' };
        requestBody = JSON.stringify({
          model: effectiveModel || 'local-model',
          messages,
          max_tokens: maxTokens || 1024,
          temperature: temperature || 0.7
        });
        break;

      case 'openai':
        apiUrl = 'https://api.openai.com/v1/chat/completions';
        headers = {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${effectiveApiKey}`
        };
        requestBody = JSON.stringify({
          model: effectiveModel || 'gpt-4o-mini',
          messages,
          max_tokens: maxTokens || 1024,
          temperature: temperature || 0.7
        });
        break;

      case 'custom':
      default:
        // Custom endpoint - use OpenAI-compatible format
        apiUrl = endpoint || 'https://api.openai.com/v1/chat/completions';
        headers = {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${effectiveApiKey}`
        };
        requestBody = JSON.stringify({
          model: effectiveModel || 'default',
          messages,
          max_tokens: maxTokens || 1024,
          temperature: temperature || 0.7
        });
        break;
    }

    // Make API request
    const apiResponse = await fetch(apiUrl, {
      method: 'POST',
      headers,
      body: requestBody
    });

    const responseData = await apiResponse.json();

    if (!apiResponse.ok) {
      console.error('❌ LLM API error:', responseData);
      return res.status(apiResponse.status).json({
        error: responseData.error?.message || responseData.detail || 'LLM API request failed',
        details: responseData
      });
    }

    // Parse response based on provider
    let content, usage;
    if (provider === 'anthropic') {
      content = responseData.content?.[0]?.text || '';
      usage = {
        prompt_tokens: responseData.usage?.input_tokens,
        completion_tokens: responseData.usage?.output_tokens,
        total_tokens: (responseData.usage?.input_tokens || 0) + (responseData.usage?.output_tokens || 0)
      };
    } else {
      // OpenAI-compatible format (together, llama, openai, local, custom)
      content = responseData.choices?.[0]?.message?.content || '';
      usage = responseData.usage;
    }

    console.log(`✅ Mentor response: ${content.length} chars, shared=${isUsingSharedApi}`);

    return res.status(200).json({
      content,
      usage,
      provider,
      model: effectiveModel,
      isSharedApi: isUsingSharedApi
    });

  } catch (error) {
    console.error('❌ Mentor chat error:', error);
    return res.status(500).json({ error: error.message });
  }
}
