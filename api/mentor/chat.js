/**
 * Vercel Serverless Function: /api/mentor/chat
 *
 * Together AI-powered chess mentor with credit system.
 * Features:
 * - Default: Together.ai with server-side API key (moonshotai/Kimi-K2.5)
 * - Credit system: 1 credit per message for free users, bypass for premium
 * - Optional BYO API key mode (behind feature flag)
 */

import { checkRateLimit, getClientIP } from '../_lib/rate-limit.js';
import { logAction, logError } from '../_lib/logger.js';
import { authenticateRequest } from '../_lib/auth.js';
import { createClient } from '@supabase/supabase-js';

// Allowed providers for validation
const ALLOWED_PROVIDERS = ['together', 'llama', 'openai', 'anthropic', 'local', 'custom'];

// Input validation limits
const MAX_MESSAGES = 50;
const MAX_CONTENT_LENGTH = 100000; // 100KB per message

// API base URLs (can be overridden via env vars)
const LLAMA_API_BASE_URL = process.env.LLAMA_API_BASE_URL || 'https://api.llama.com';
const TOGETHER_API_BASE_URL = process.env.TOGETHER_BASE_URL || process.env.TOGETHER_API_BASE_URL || 'https://api.together.xyz';

// Default Together AI configuration (credit-based for free users)
const TOGETHER_API_KEY = process.env.TOGETHER_API_KEY; // Server-side only, never sent to client
const TOGETHER_MODEL = process.env.TOGETHER_MODEL || 'moonshotai/Kimi-K2.5';
const TOGETHER_API_ENABLED = !!TOGETHER_API_KEY;

// Supabase client for credit management
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = supabaseUrl && supabaseServiceKey
  ? createClient(supabaseUrl, supabaseServiceKey)
  : null;

// Credit cost for mentor messages
const MENTOR_CREDIT_COST = 1;

export default async function handler(req, res) {
  // Only accept POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  // Handle preflight
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    const { provider, apiKey, messages, model, maxTokens, temperature, endpoint } = req.body;

    // Check if Together AI is configured
    if (!TOGETHER_API_ENABLED) {
      logError('mentor_chat', 'Together AI not configured', { detail: 'TOGETHER_API_KEY missing' });
      return res.status(503).json({
        error: 'AI service temporarily unavailable. Please try again later.',
        code: 'SERVICE_UNAVAILABLE'
      });
    }

    // Determine mode: default Together AI or BYO key
    const isByoKey = !!apiKey;
    const isDefaultMode = !isByoKey;

    // Default mode: Together AI with credits (requires auth)
    if (isDefaultMode) {
      // Authenticate user
      const auth = await authenticateRequest(req);
      if (!auth.authenticated) {
        return res.status(401).json({
          error: 'Sign in required to use AI Mentor.',
          code: 'AUTH_REQUIRED'
        });
      }

      // Check if Supabase is available
      if (!supabase) {
        logError('mentor_chat', 'Supabase not configured');
        return res.status(503).json({
          error: 'Service temporarily unavailable.',
          code: 'SERVICE_UNAVAILABLE'
        });
      }

      // Get user from database
      const { data: user, error: userError } = await supabase
        .from('users')
        .select('id, is_premium, credits')
        .eq('clerk_id', auth.userId)
        .single();

      if (userError || !user) {
        logError('mentor_chat', 'User not found', { detail: { userId: auth.userId } });
        return res.status(404).json({
          error: 'User not found. Please refresh and try again.',
          code: 'USER_NOT_FOUND'
        });
      }

      // Check if premium (bypass credits) or has enough credits
      if (!user.is_premium && user.credits < MENTOR_CREDIT_COST) {
        logAction('mentor_blocked', { detail: { userId: auth.userId, credits: user.credits } });
        return res.status(402).json({
          error: 'Insufficient credits. Purchase more credits or upgrade to Premium for unlimited AI access.',
          code: 'INSUFFICIENT_CREDITS',
          credits: user.credits,
          required: MENTOR_CREDIT_COST
        });
      }

      // Input validation BEFORE consuming credits
      if (!messages || !Array.isArray(messages)) {
        return res.status(400).json({ error: 'Messages array is required' });
      }

      if (messages.length > MAX_MESSAGES) {
        return res.status(400).json({ error: `Too many messages. Maximum: ${MAX_MESSAGES}` });
      }

      for (const msg of messages) {
        if (msg.content && msg.content.length > MAX_CONTENT_LENGTH) {
          return res.status(400).json({
            error: `Message content too long. Maximum: ${MAX_CONTENT_LENGTH} characters`
          });
        }
      }

      // Consume credit for free users
      if (!user.is_premium) {
        const { error: consumeError } = await supabase
          .from('users')
          .update({ credits: user.credits - MENTOR_CREDIT_COST })
          .eq('id', user.id);

        if (consumeError) {
          logError('mentor_chat', 'Failed to consume credit', { detail: { userId: auth.userId } });
          return res.status(500).json({
            error: 'Failed to process request. Please try again.'
          });
        }

        logAction('mentor_credit_consumed', { userId: auth.userId, detail: { remaining: user.credits - MENTOR_CREDIT_COST } });
      }

      logAction('mentor_request', { userId: auth.userId, detail: { provider: 'together', model: TOGETHER_MODEL, messages: messages.length, premium: user.is_premium } });

      // Use Together AI
      return await callTogetherAI(req, res, messages, TOGETHER_API_KEY, TOGETHER_MODEL, maxTokens, temperature);
    }

    // BYO key mode - validate and proceed
    if (!ALLOWED_PROVIDERS.includes(provider)) {
      return res.status(400).json({
        error: `Unknown provider: ${provider}. Allowed: ${ALLOWED_PROVIDERS.join(', ')}`
      });
    }

    if (provider !== 'local' && !apiKey) {
      return res.status(400).json({
        error: 'API key is required for this provider.'
      });
    }

    // BYO key mode: validate input
    if (!messages || !Array.isArray(messages)) {
      return res.status(400).json({ error: 'Messages array is required' });
    }

    if (messages.length > MAX_MESSAGES) {
      return res.status(400).json({ error: `Too many messages. Maximum: ${MAX_MESSAGES}` });
    }

    for (const msg of messages) {
      if (msg.content && msg.content.length > MAX_CONTENT_LENGTH) {
        return res.status(400).json({
          error: `Message content too long. Maximum: ${MAX_CONTENT_LENGTH} characters`
        });
      }
    }

    logAction('mentor_request_byo', { detail: { provider, model, messages: messages.length } });

    let apiUrl, headers, requestBody;

    // Configure request based on provider (BYO key mode)
    switch (provider) {
      case 'together':
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

    // Make API request (BYO key mode)
    const apiResponse = await fetch(apiUrl, {
      method: 'POST',
      headers,
      body: requestBody
    });

    const responseData = await apiResponse.json();

    if (!apiResponse.ok) {
      logError('mentor_llm_byo', responseData.error?.message || 'LLM API error', { detail: { provider, status: apiResponse.status } });
      return res.status(apiResponse.status).json({
        error: responseData.error?.message || responseData.detail || 'LLM API request failed'
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
      content = responseData.choices?.[0]?.message?.content || '';
      usage = responseData.usage;
    }

    logAction('mentor_response_byo', { detail: { chars: content.length, provider } });

    return res.status(200).json({
      content,
      usage,
      provider,
      model,
      isSharedApi: false
    });

  } catch (error) {
    logError('mentor_chat', error);
    return res.status(500).json({ error: 'An error occurred processing your request.' });
  }
}

/**
 * Call Together AI with server-side API key
 * @param {Object} req - Request object
 * @param {Object} res - Response object
 * @param {Array} messages - Chat messages
 * @param {string} apiKey - Together AI API key
 * @param {string} model - Model to use
 * @param {number} maxTokens - Max tokens
 * @param {number} temperature - Temperature
 * @returns {Promise<Response>}
 */
async function callTogetherAI(req, res, messages, apiKey, model, maxTokens, temperature) {
  try {
    const apiUrl = `${TOGETHER_API_BASE_URL}/v1/chat/completions`;
    const headers = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    };
    const requestBody = JSON.stringify({
      model,
      messages,
      max_tokens: maxTokens || 1024,
      temperature: temperature || 0.7
    });

    const apiResponse = await fetch(apiUrl, {
      method: 'POST',
      headers,
      body: requestBody
    });

    const responseData = await apiResponse.json();

    if (!apiResponse.ok) {
      logError('mentor_together_ai', responseData.error?.message || 'Together AI error', { detail: { status: apiResponse.status } });
      return res.status(apiResponse.status >= 500 ? 503 : apiResponse.status).json({
        error: 'AI service error. Please try again.',
        code: 'AI_ERROR'
      });
    }

    const content = responseData.choices?.[0]?.message?.content || '';
    const usage = responseData.usage;

    logAction('mentor_response', { detail: { chars: content.length } });

    return res.status(200).json({
      content,
      usage,
      provider: 'together',
      model,
      isSharedApi: true
    });

  } catch (error) {
    logError('mentor_together_ai', error);
    return res.status(503).json({
      error: 'AI service temporarily unavailable. Please try again.',
      code: 'AI_ERROR'
    });
  }
}
