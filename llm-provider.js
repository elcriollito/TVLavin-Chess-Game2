/**
 * CAISSA Mentor AI - LLM Provider Abstraction Layer
 *
 * This module provides a unified interface for different LLM providers.
 * Supports: Meta Llama, OpenAI, Anthropic Claude, Local models, Custom endpoints
 */

const LLMProvider = {

    // Current provider configuration
    config: {
        provider: 'llama', // 'llama', 'openai', 'anthropic', 'local', 'custom'
        apiKey: null,
        model: null, // Will use provider default if not set
        endpoint: null, // For custom endpoints
        maxTokens: 1024,
        temperature: 0.7
    },

    // Provider-specific configurations
    PROVIDERS: {
        // Meta Llama API - recommended default
        llama: {
            name: 'Meta Llama',
            endpoint: 'https://api.llama.com/v1/chat/completions', // Meta's official API
            models: ['llama-4-scout-17b-16e-instruct', 'llama-4-maverick-17b-128e-instruct', 'llama-3.3-70b-instruct'],
            defaultModel: 'llama-4-scout-17b-16e-instruct',
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
            models: ['gpt-4o-mini', 'gpt-4o', 'gpt-4-turbo', 'gpt-3.5-turbo'],
            defaultModel: 'gpt-4o-mini', // Cost-effective default
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
            models: ['claude-sonnet-4-20250514', 'claude-3-5-sonnet-20241022', 'claude-3-5-haiku-20241022'],
            defaultModel: 'claude-sonnet-4-20250514', // Current recommended model
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

        custom: {
            name: 'Custom Endpoint',
            endpoint: null, // Set via config
            models: ['custom'],
            defaultModel: 'custom',
            formatRequest: (messages, config) => ({
                messages: messages,
                max_tokens: config.maxTokens,
                temperature: config.temperature
            }),
            parseResponse: (response) => ({
                content: response.content || response.choices?.[0]?.message?.content || 'No response',
                usage: response.usage || { total_tokens: 0 }
            }),
            headers: (apiKey) => ({
                'Content-Type': 'application/json',
                ...(apiKey ? { 'Authorization': `Bearer ${apiKey}` } : {})
            })
        }
    },

    /**
     * Initialize the provider with configuration
     * @param {Object} options - Configuration options
     */
    initialize(options = {}) {
        this.config = { ...this.config, ...options };

        // Validate provider
        if (!this.PROVIDERS[this.config.provider]) {
            console.warn(`Unknown provider: ${this.config.provider}, falling back to llama`);
            this.config.provider = 'llama';
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
     * @returns {Promise<Object>} - Response with content and usage
     */
    async chat(messages) {
        const provider = this.PROVIDERS[this.config.provider];

        if (!provider) {
            throw new Error(`Provider not configured: ${this.config.provider}`);
        }

        // Check API key (except for local)
        if (this.config.provider !== 'local' && !this.config.apiKey) {
            throw new Error('API key not set. Call setApiKey() first.');
        }

        // Use server proxy to avoid CORS issues
        const proxyEndpoint = `${window.location.origin}/api/mentor/chat`;

        try {
            const response = await fetch(proxyEndpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    provider: this.config.provider,
                    apiKey: this.config.apiKey,
                    messages: messages,
                    model: this.config.model,
                    maxTokens: this.config.maxTokens,
                    temperature: this.config.temperature
                })
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(
                    errorData.error ||
                    `API request failed: ${response.status} ${response.statusText}`
                );
            }

            const data = await response.json();
            return {
                content: data.content,
                usage: data.usage
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
        const provider = this.PROVIDERS[this.config.provider];

        if (!provider) {
            throw new Error(`Provider not configured: ${this.config.provider}`);
        }

        const endpoint = this.config.endpoint || provider.endpoint;
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
            hasApiKey: !!this.config.apiKey
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
