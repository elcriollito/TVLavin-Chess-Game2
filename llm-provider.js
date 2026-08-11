/**
 * CAISSA Mentor AI - LLM Provider Abstraction Layer
 *
 * This module provides a unified interface for different LLM providers.
 * Supports: Together.ai, Meta Llama, OpenAI, Anthropic Claude, and local models
 *
 * Features:
 * - Shared API mode (no key required for Together.ai)
 * - BYO API key mode (unlimited access)
 * - Automatic fallback handling
 */

const LLMProvider = {

    // Current provider configuration
    config: {
        provider: 'together', // 'together', 'llama', 'openai', 'anthropic', 'local'
        apiKey: null,
        model: null, // Will use provider default if not set
        maxTokens: 1024,
        temperature: 0.7
    },

    // Shared API state
    sharedApiState: {
        enabled: false,        // Whether server has shared API configured
        remainingWindow: null, // Requests remaining in current window
        remainingDaily: null,  // Requests remaining today
        lastChecked: null
    },

    // Provider-specific configurations
    PROVIDERS: {
        // Together.ai - cost-efficient LLaMA hosting (recommended)
        together: {
            name: 'Together.ai',
            endpoint: 'https://api.together.xyz/v1/chat/completions',
            models: ['meta-llama/Llama-3.3-70B-Instruct-Turbo', 'meta-llama/Llama-4-Scout-17B-16E-Instruct'],
            defaultModel: 'meta-llama/Llama-3.3-70B-Instruct-Turbo',
            supportsSharedApi: true, // Only Together.ai supports shared API
            formatRequest: (messages, config) => ({
                model: config.model,
                messages: messages,
                max_tokens: config.maxTokens,
                temperature: config.temperature
            }),
            parseResponse: (response) => ({
                content: response.choices[0].message.content,
                usage: response.usage
            }),
            headers: (apiKey) => ({
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`
            })
        },

        // Meta Llama API - direct access
        llama: {
            name: 'Meta Llama',
            endpoint: 'https://api.llama.com/v1/chat/completions', // Meta's official API
            models: ['llama-4-scout-17b-16e-instruct', 'llama-3.3-70b-instruct'],
            defaultModel: 'llama-4-scout-17b-16e-instruct',
            supportsSharedApi: false,
            formatRequest: (messages, config) => ({
                model: config.model,
                messages: messages,
                max_tokens: config.maxTokens,
                temperature: config.temperature
            }),
            parseResponse: (response) => ({
                content: response.choices[0].message.content,
                usage: response.usage
            }),
            headers: (apiKey) => ({
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`
            })
        },

        openai: {
            name: 'OpenAI',
            endpoint: 'https://api.openai.com/v1/chat/completions',
            models: ['gpt-4o-mini'],
            defaultModel: 'gpt-4o-mini', // Cost-effective default
            supportsSharedApi: false,
            formatRequest: (messages, config) => ({
                model: config.model,
                messages: messages,
                max_tokens: config.maxTokens,
                temperature: config.temperature
            }),
            parseResponse: (response) => ({
                content: response.choices[0].message.content,
                usage: response.usage
            }),
            headers: (apiKey) => ({
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`
            })
        },

        anthropic: {
            name: 'Anthropic Claude',
            endpoint: 'https://api.anthropic.com/v1/messages',
            models: ['claude-3-5-haiku-20241022', 'claude-3-5-sonnet-20241022'],
            defaultModel: 'claude-3-5-haiku-20241022',
            supportsSharedApi: false,
            formatRequest: (messages, config) => {
                // Claude uses a different format - separate system from messages
                const systemMessage = messages.find(m => m.role === 'system');
                const otherMessages = messages.filter(m => m.role !== 'system');

                return {
                    model: config.model,
                    max_tokens: config.maxTokens,
                    system: systemMessage ? systemMessage.content : '',
                    messages: otherMessages.map(m => ({
                        role: m.role,
                        content: m.content
                    }))
                };
            },
            parseResponse: (response) => ({
                content: response.content[0].text,
                usage: {
                    prompt_tokens: response.usage.input_tokens,
                    completion_tokens: response.usage.output_tokens,
                    total_tokens: response.usage.input_tokens + response.usage.output_tokens
                }
            }),
            headers: (apiKey) => ({
                'Content-Type': 'application/json',
                'x-api-key': apiKey,
                'anthropic-version': '2023-06-01'
            })
        },

        local: {
            name: 'Local LLM',
            endpoint: 'http://localhost:1234/v1/chat/completions', // LM Studio default
            models: ['local-model'],
            defaultModel: 'local-model',
            supportsSharedApi: false,
            formatRequest: (messages, config) => ({
                model: config.model,
                messages: messages,
                max_tokens: config.maxTokens,
                temperature: config.temperature
            }),
            parseResponse: (response) => ({
                content: response.choices[0].message.content,
                usage: response.usage || { total_tokens: 0 }
            }),
            headers: () => ({
                'Content-Type': 'application/json'
            })
        },

    },

    /**
     * Initialize the provider with configuration
     * @param {Object} options - Configuration options
     */
    initialize(options = {}) {
        this.config = { ...this.config, ...options };

        // Validate provider
        if (!this.PROVIDERS[this.config.provider]) {
            console.warn(`Unknown provider: ${this.config.provider}, falling back to together`);
            this.config.provider = 'together';
        }

        // Set default model for provider if not specified
        const provider = this.PROVIDERS[this.config.provider];
        if (!this.config.model || !provider.models.includes(this.config.model)) {
            this.config.model = provider.defaultModel;
        }

        console.log(`LLM Provider initialized: ${provider.name} (${this.config.model})`);
    },

    /**
     * Set API key
     * @param {string} apiKey - The API key
     */
    setApiKey(apiKey) {
        this.config.apiKey = apiKey;
    },

    /**
     * Check if current provider can use shared API (no key required)
     * @returns {boolean}
     */
    canUseSharedApi() {
        const provider = this.PROVIDERS[this.config.provider];
        return provider?.supportsSharedApi === true;
    },

    /**
     * Check if API key is configured or default AI is available
     * @returns {boolean}
     */
    isReady() {
        // Check feature flag for BYO key mode
        const byoKeyEnabled = window.CaissaFeatureFlags?.isEnabled('BYO_AI_KEY');

        // BYO key mode: require API key or local provider
        if (byoKeyEnabled) {
            if (this.config.provider === 'local') return true;
            if (this.config.apiKey) return true;
            if (this.canUseSharedApi()) return true;
            return false;
        }

        // Default mode: Together AI backend always available (auth happens on backend)
        return true;
    },

    /**
     * Get rate limit status for shared API
     * @returns {Object|null}
     */
    getRateLimitStatus() {
        if (this.config.apiKey) {
            return null; // BYO key has no limits
        }
        return {
            remainingWindow: this.sharedApiState.remainingWindow,
            remainingDaily: this.sharedApiState.remainingDaily,
            isSharedApi: true
        };
    },

    /**
     * Switch provider
     * @param {string} providerName - Provider name
     * @param {Object} options - Additional options
     */
    switchProvider(providerName, options = {}) {
        this.config.provider = providerName;
        this.initialize(options);
    },

    /**
     * Send a chat request to the LLM
     * Uses server proxy to avoid CORS issues in browser
     * @param {Array} messages - Array of message objects
     * @param {Object} options - Optional overrides (temperature, engineReport)
     * @returns {Promise<Object>} - Response with content and usage
     */
    async chat(messages, options = {}) {
        const provider = this.PROVIDERS[this.config.provider];

        if (!provider) {
            throw new Error(`Provider not configured: ${this.config.provider}`);
        }

        // Check feature flag for BYO key mode
        const byoKeyEnabled = window.CaissaFeatureFlags?.isEnabled('BYO_AI_KEY');

        // BYO key mode: require API key (except for local)
        if (byoKeyEnabled && this.config.provider !== 'local' && !this.config.apiKey && !this.canUseSharedApi()) {
            throw new Error('API key not set. Configure your API key in Settings.');
        }

        // Use server proxy
        const proxyEndpoint = `${window.location.origin}/api/mentor/chat`;

        // Allow temperature override (lower for engine-guided responses)
        const temperature = options.temperature ?? this.config.temperature;

        // Get auth token if user is signed in
        const authToken = await window.CAISSA_AUTH?.getToken?.() || null;

        try {
            const headers = { 'Content-Type': 'application/json' };
            if (authToken) {
                headers['Authorization'] = `Bearer ${authToken}`;
            }

            const response = await fetch(proxyEndpoint, {
                method: 'POST',
                headers,
                body: JSON.stringify({
                    provider: this.config.provider,
                    apiKey: this.config.apiKey || null,
                    messages: messages,
                    model: this.config.apiKey ? this.config.model : null,
                    maxTokens: this.config.maxTokens,
                    temperature: temperature,
                    engineReport: options.engineReport || null
                })
            });

            // Parse rate limit headers
            const remainingWindow = response.headers.get('X-RateLimit-Remaining-Window');
            const remainingDaily = response.headers.get('X-RateLimit-Remaining-Daily');

            if (remainingWindow !== null) {
                this.sharedApiState.remainingWindow = parseInt(remainingWindow, 10);
                this.sharedApiState.remainingDaily = parseInt(remainingDaily, 10);
                this.sharedApiState.lastChecked = Date.now();
            }

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));

                // Handle specific error codes
                if (response.status === 401 && errorData.code === 'AUTH_REQUIRED') {
                    throw new Error('Sign in required to use AI Mentor. Click the sign-in button to continue.');
                }

                if (response.status === 402 && errorData.code === 'INSUFFICIENT_CREDITS') {
                    throw new Error('Insufficient credits. Purchase more credits or upgrade to Premium for unlimited AI access.');
                }

                if (response.status === 503 && errorData.code === 'SERVICE_UNAVAILABLE') {
                    throw new Error('AI service temporarily unavailable. Please try again in a moment.');
                }

                if (response.status === 429 && errorData.code === 'RATE_LIMITED') {
                    throw new Error(errorData.error || 'Rate limit exceeded. Please try again later.');
                }

                // Generic error
                throw new Error(
                    errorData.error ||
                    `AI request failed: ${response.status} ${response.statusText}`
                );
            }

            const data = await response.json();

            // Track if using shared API
            if (data.isSharedApi) {
                this.sharedApiState.enabled = true;
            }

            return {
                content: data.content,
                usage: data.usage,
                isSharedApi: data.isSharedApi || false
            };

        } catch (error) {
            console.error('LLM Provider error:', error);
            throw error;
        }
    },

    /**
     * Stream a chat request (for supported providers)
     * @param {Array} messages - Array of message objects
     * @param {Function} onChunk - Callback for each chunk
     * @returns {Promise<Object>} - Final response
     */
    async chatStream(messages, onChunk) {
        if (this.config.provider === 'custom') {
            throw new Error('Custom AI endpoints are temporarily unavailable.');
        }

        const provider = this.PROVIDERS[this.config.provider];

        if (!provider) {
            throw new Error(`Provider not configured: ${this.config.provider}`);
        }

        const endpoint = provider.endpoint;
        const headers = provider.headers(this.config.apiKey);
        const body = {
            ...provider.formatRequest(messages, this.config),
            stream: true
        };

        try {
            const response = await fetch(endpoint, {
                method: 'POST',
                headers: headers,
                body: JSON.stringify(body)
            });

            if (!response.ok) {
                throw new Error(`API request failed: ${response.status}`);
            }

            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let fullContent = '';

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                const chunk = decoder.decode(value);
                const lines = chunk.split('\n').filter(line => line.startsWith('data: '));

                for (const line of lines) {
                    const data = line.slice(6); // Remove 'data: '
                    if (data === '[DONE]') continue;

                    try {
                        const parsed = JSON.parse(data);
                        const content = parsed.choices?.[0]?.delta?.content || '';
                        if (content) {
                            fullContent += content;
                            if (onChunk) onChunk(content, fullContent);
                        }
                    } catch (e) {
                        // Skip malformed chunks
                    }
                }
            }

            return { content: fullContent, usage: null };

        } catch (error) {
            console.error('LLM Stream error:', error);
            throw error;
        }
    },

    /**
     * Get available models for current provider
     * @returns {Array} - List of model names
     */
    getAvailableModels() {
        const provider = this.PROVIDERS[this.config.provider];
        return provider ? provider.models : [];
    },

    /**
     * Get current configuration
     * @returns {Object} - Current config
     */
    getConfig() {
        return {
            provider: this.config.provider,
            model: this.config.model,
            maxTokens: this.config.maxTokens,
            temperature: this.config.temperature,
            hasApiKey: !!this.config.apiKey,
            canUseSharedApi: this.canUseSharedApi(),
            isReady: this.isReady()
        };
    },

    /**
     * Test the connection to the provider
     * @returns {Promise<boolean>} - True if connection successful
     */
    async testConnection() {
        try {
            const result = await this.chat([
                { role: 'user', content: 'Say "OK" and nothing else.' }
            ]);
            return result.content.toLowerCase().includes('ok');
        } catch (error) {
            console.error('Connection test failed:', error);
            return false;
        }
    }
};

// Export for use in browser and Node.js
if (typeof module !== 'undefined' && module.exports) {
    module.exports = LLMProvider;
}
