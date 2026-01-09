import type { LLMMoveRequest, LLMMoveResponse, Move } from '../store/types';

export type LLMStyle = 'aggressive' | 'defensive' | 'positional' | 'tactical' | 'creative';

export interface LLMConfig {
  apiKey?: string;
  baseURL?: string;
  model: 'claude-haiku' | 'claude-sonnet' | 'gpt-4o' | 'local';
  maxRetries: number;
  timeout: number;
}

export class LLMAdapter {
  private config: LLMConfig;

  constructor(config: Partial<LLMConfig> = {}) {
    this.config = {
      apiKey: config.apiKey || '',
      baseURL: config.baseURL || 'https://api.anthropic.com/v1',
      model: config.model || 'claude-haiku',
      maxRetries: config.maxRetries || 3,
      timeout: config.timeout || 10000,
    };
  }

  // ===== MAIN API =====
  async getMove(request: LLMMoveRequest): Promise<LLMMoveResponse> {
    const startTime = Date.now();

    // Try multiple times with different prompts if parsing fails
    for (let attempt = 0; attempt < this.config.maxRetries; attempt++) {
      try {
        const prompt = this.buildPrompt(request, attempt);
        const responseText = await this.callLLM(prompt, request.config.temperature);
        const parsed = this.parseResponse(responseText);

        // Validate move format
        if (!this.isValidMoveFormat(parsed.moveUci)) {
          throw new Error(`Invalid move format: ${parsed.moveUci}`);
        }

        return {
          ...parsed,
          thinkingTime: Date.now() - startTime,
        };
      } catch (error) {
        console.error(`LLM attempt ${attempt + 1} failed:`, error);

        if (attempt === this.config.maxRetries - 1) {
          throw new Error(`LLM failed after ${this.config.maxRetries} attempts: ${(error as Error).message}`);
        }

        // Wait before retry
        await new Promise(resolve => setTimeout(resolve, 500 * (attempt + 1)));
      }
    }

    throw new Error('LLM failed to produce valid move');
  }

  // ===== PROMPT ENGINEERING =====
  private buildPrompt(request: LLMMoveRequest, attempt: number): string {
    const { fen, history, config } = request;

    // Extract position info
    const [position, turn, castling, enPassant, halfmove, fullmove] = fen.split(' ');
    const sideToMove = turn === 'w' ? 'White' : 'Black';

    // Build move history string
    const recentMoves = history.slice(-10).map((m, i) => {
      const moveNum = Math.floor(i / 2) + Math.max(1, fullmove ? parseInt(fullmove) - 5 : 1);
      return i % 2 === 0 ? `${moveNum}. ${m.san}` : m.san;
    }).join(' ');

    // Style-specific instructions
    const stylePrompt = this.getStylePrompt(config.style || 'positional');

    // Base prompt (changes slightly on retries to get different responses)
    const retryHint = attempt > 0
      ? `\n\nIMPORTANT: Previous attempts failed. Focus on providing a clear, legal move in exact UCI format (e.g., "e2e4", "g1f3", "e7e8q" for promotion).`
      : '';

    return `You are a ${config.style || 'balanced'} chess player. Analyze the position and choose your next move.

POSITION (FEN): ${fen}
YOUR COLOR: ${sideToMove}
CASTLING RIGHTS: ${castling !== '-' ? castling : 'None'}
EN PASSANT: ${enPassant !== '-' ? enPassant : 'None'}

RECENT MOVES:
${recentMoves || 'Game just started'}

STYLE GUIDANCE:
${stylePrompt}

INSTRUCTIONS:
1. Analyze the position considering: material, king safety, piece activity, pawn structure
2. Consider 2-3 candidate moves
3. Choose the best move that fits your playing style
4. Explain your reasoning briefly (2-3 sentences)
5. Respond in EXACT JSON format below

REQUIRED JSON FORMAT:
{
  "moveUci": "e2e4",
  "reasoning": "Your explanation here",
  "confidence": 0.85
}

MOVE FORMAT RULES:
- Use UCI notation: from-square + to-square (e.g., "e2e4", "g1f3")
- For promotion, add piece letter: "e7e8q" (queen), "e7e8r" (rook), "e7e8b" (bishop), "e7e8n" (knight)
- Squares use lowercase letters (a-h) and numbers (1-8)
- No spaces, no hyphens, just 4-5 characters total${retryHint}

Respond with ONLY the JSON object, no other text.`;
  }

  private getStylePrompt(style: LLMStyle): string {
    const styles: Record<LLMStyle, string> = {
      aggressive: 'Play aggressively. Prioritize attacks on the enemy king, tactical shots, and sacrifices if they lead to initiative. Accept material imbalances for attack.',
      defensive: 'Play solidly and defensively. Prioritize king safety, prophylactic moves, and maintaining material balance. Avoid unnecessary risks.',
      positional: 'Play positionally. Focus on controlling key squares, improving piece placement, and long-term strategic advantages. Avoid premature tactics.',
      tactical: 'Look for tactical opportunities: forks, pins, skewers, discovered attacks. Calculate concrete variations. Favor sharp positions.',
      creative: 'Play creatively and unconventionally. Consider surprising moves that deviate from theory. Balance between soundness and originality.',
    };

    return styles[style] || styles.positional;
  }

  // ===== API CALL =====
  private async callLLM(prompt: string, temperature: number): Promise<string> {
    // Check for API key
    if (!this.config.apiKey && this.config.model !== 'local') {
      console.warn('No API key provided, using mock response');
      return this.getMockResponse();
    }

    // Model-specific API calls
    switch (this.config.model) {
      case 'claude-haiku':
      case 'claude-sonnet':
        return this.callClaude(prompt, temperature);
      case 'gpt-4o':
        return this.callOpenAI(prompt, temperature);
      case 'local':
        return this.callLocalLLM(prompt, temperature);
      default:
        throw new Error(`Unknown model: ${this.config.model}`);
    }
  }

  private async callClaude(prompt: string, temperature: number): Promise<string> {
    const modelMap = {
      'claude-haiku': 'claude-3-haiku-20240307',
      'claude-sonnet': 'claude-3-5-sonnet-20241022',
    };

    const response = await fetch(`${this.config.baseURL}/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.config.apiKey!,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: modelMap[this.config.model as 'claude-haiku' | 'claude-sonnet'],
        max_tokens: 1024,
        temperature: temperature,
        messages: [
          {
            role: 'user',
            content: prompt,
          },
        ],
      }),
      signal: AbortSignal.timeout(this.config.timeout),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(`Claude API error: ${error.error?.message || response.statusText}`);
    }

    const data = await response.json();
    return data.content[0].text;
  }

  private async callOpenAI(prompt: string, temperature: number): Promise<string> {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.config.apiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o',
        messages: [
          {
            role: 'system',
            content: 'You are a chess playing assistant. Always respond with valid JSON containing a chess move in UCI format.',
          },
          {
            role: 'user',
            content: prompt,
          },
        ],
        temperature: temperature,
        max_tokens: 1024,
      }),
      signal: AbortSignal.timeout(this.config.timeout),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(`OpenAI API error: ${error.error?.message || response.statusText}`);
    }

    const data = await response.json();
    return data.choices[0].message.content;
  }

  private async callLocalLLM(prompt: string, temperature: number): Promise<string> {
    // Placeholder for local LLM (llama.cpp, Ollama, etc.)
    console.log('Local LLM not implemented, using mock response');
    return this.getMockResponse();
  }

  // ===== RESPONSE PARSING =====
  private parseResponse(content: string): LLMMoveResponse {
    // Try to extract JSON from response
    const jsonMatch = content.match(/\{[\s\S]*?\}/);
    if (!jsonMatch) {
      throw new Error('No JSON found in LLM response');
    }

    try {
      const parsed = JSON.parse(jsonMatch[0]);

      if (!parsed.moveUci) {
        throw new Error('Missing moveUci in response');
      }

      return {
        moveUci: parsed.moveUci.toLowerCase().trim(),
        reasoning: parsed.reasoning || 'No reasoning provided',
        confidence: parsed.confidence || 0.5,
      };
    } catch (error) {
      throw new Error(`Failed to parse JSON: ${(error as Error).message}`);
    }
  }

  // ===== VALIDATION =====
  private isValidMoveFormat(move: string): boolean {
    // UCI format: 4 chars (e2e4) or 5 chars for promotion (e7e8q)
    const uciPattern = /^[a-h][1-8][a-h][1-8][qrbn]?$/;
    return uciPattern.test(move);
  }

  // ===== MOCK RESPONSE (for testing without API key) =====
  private getMockResponse(): string {
    const mockMoves = ['e2e4', 'g1f3', 'd2d4', 'c2c4', 'b1c3'];
    const randomMove = mockMoves[Math.floor(Math.random() * mockMoves.length)];

    return JSON.stringify({
      moveUci: randomMove,
      reasoning: `This is a mock response. The move ${randomMove} is a standard opening move that controls the center and develops pieces effectively.`,
      confidence: 0.75,
    });
  }

  // ===== CONFIGURATION =====
  setApiKey(apiKey: string): void {
    this.config.apiKey = apiKey;
  }

  setModel(model: LLMConfig['model']): void {
    this.config.model = model;
  }
}
