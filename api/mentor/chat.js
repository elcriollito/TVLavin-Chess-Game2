/**
 * Vercel Serverless Function: /api/mentor/chat
 *
 * Proxies LLM API calls to avoid CORS issues in the browser.
 * Supports: Together.ai, Meta Llama, OpenAI, Anthropic, Local, Custom
 */

// Allowed providers for validation
const ALLOWED_PROVIDERS = ['together', 'llama', 'openai', 'anthropic', 'local', 'custom'];

// Input validation limits
const MAX_MESSAGES = 50;
const MAX_CONTENT_LENGTH = 100000; // 100KB per message

// API base URLs (can be overridden via env vars)
const LLAMA_API_BASE_URL = process.env.LLAMA_API_BASE_URL || 'https://api.llama.com';
const TOGETHER_API_BASE_URL = process.env.TOGETHER_API_BASE_URL || 'https://api.together.xyz';

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

    // Validate provider
    if (!ALLOWED_PROVIDERS.includes(provider)) {
      return res.status(400).json({
        error: `Unknown provider: ${provider}. Allowed: ${ALLOWED_PROVIDERS.join(', ')}`
      });
    }

    // API key required for non-local providers
    if (provider !== 'local' && !apiKey) {
      return res.status(400).json({ error: 'API key is required' });
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

    console.log(`🤖 Mentor Chat: provider=${provider}, model=${model}, messages=${messages.length}`);

    let apiUrl, headers, requestBody;

    // Configure request based on provider
    switch (provider) {
      case 'together':
        // Together.ai - cost-efficient LLaMA hosting
        apiUrl = `${TOGETHER_API_BASE_URL}/v1/chat/completions`;
        headers = {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        };
        requestBody = JSON.stringify({
          model: model || 'meta-llama/Llama-3.3-70B-Instruct-Turbo',
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
          'Authorization': `Bearer ${apiKey}`
        };
        requestBody = JSON.stringify({
          model: model || 'llama-4-scout-17b-16e-instruct',
          messages,
          max_completion_tokens: maxTokens || 1024,
          temperature: temperature || 0.7
        });
        break;

      case 'anthropic':
        apiUrl = 'https://api.anthropic.com/v1/messages';
        headers = {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01'
        };
        // Convert OpenAI format to Anthropic format
        const systemMsg = messages.find(m => m.role === 'system');
        const otherMsgs = messages.filter(m => m.role !== 'system');
        requestBody = JSON.stringify({
          model: model || 'claude-sonnet-4-20250514',
          max_tokens: maxTokens || 1024,
          system: systemMsg ? systemMsg.content : '',
          messages: otherMsgs
        });
        break;

      case 'local':
        apiUrl = 'http://localhost:1234/v1/chat/completions';
        headers = { 'Content-Type': 'application/json' };
        requestBody = JSON.stringify({
          model: model || 'local-model',
          messages,
          max_tokens: maxTokens || 1024,
          temperature: temperature || 0.7
        });
        break;

      case 'openai':
        apiUrl = 'https://api.openai.com/v1/chat/completions';
        headers = {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        };
        requestBody = JSON.stringify({
          model: model || 'gpt-4o-mini',
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
          'Authorization': `Bearer ${apiKey}`
        };
        requestBody = JSON.stringify({
          model: model || 'default',
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

    console.log(`✅ Mentor response: ${content.length} chars`);

    return res.status(200).json({ content, usage, provider, model });

  } catch (error) {
    console.error('❌ Mentor chat error:', error);
    return res.status(500).json({ error: error.message });
  }
}
