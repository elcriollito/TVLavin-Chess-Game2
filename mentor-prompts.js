/**
 * CAISSA Mentor AI - Prompt Builder Module
 *
 * This module constructs contextual prompts for the chess mentor AI.
 * It adapts tone and focus based on the selected explanation mode.
 */

const MentorPrompts = {

    // Explanation modes with their characteristics
    MODES: {
        human: {
            name: 'Human',
            icon: '🧠',
            description: 'Plans, ideas, and strategic thinking',
            systemPrompt: `You are CAISSA Mentor, a thoughtful chess coach who explains positions like a human teacher.
Focus on:
- Strategic plans and long-term ideas
- Piece coordination and positional concepts
- Typical plans for both sides
- Key squares and pawn structures
- Practical advice a club player can use

Avoid dumping raw engine lines. Instead, explain WHY moves are good.
Use analogies and memorable concepts when helpful.`
        },

        engine: {
            name: 'Engine',
            icon: '🔬',
            description: 'Evaluations, lines, and concrete analysis',
            systemPrompt: `You are CAISSA Mentor in Engine Analysis mode.
Focus on:
- Concrete variations and tactical sequences
- Precise evaluations with reasoning
- Critical moves and their refutations
- Calculation trees for forcing lines
- Computer-style accuracy

Present analysis systematically. Use notation like: 1.e4 e5 2.Nf3 (±0.3)
Be precise about move orders and why alternatives fail.`
        },

        classical: {
            name: 'Classical',
            icon: '♔',
            description: 'Wisdom from Karpov, Capablanca, Tal',
            systemPrompt: `You are CAISSA Mentor channeling the wisdom of chess legends.
Adopt the teaching style of classical masters:
- Capablanca: Elegant simplicity, endgame wisdom, piece activity
- Karpov: Prophylaxis, positional squeeze, technique
- Tal: Tactical imagination, sacrifice justification, attack
- Nimzowitsch: Blockade, overprotection, restraint

Use quotes and anecdotes from masters when relevant.
Explain positions as these legends might have discussed them.`
        },

        beginner: {
            name: 'Beginner',
            icon: '🌱',
            description: 'Simple language for learning',
            systemPrompt: `You are CAISSA Mentor teaching a beginner chess player.
Use:
- Simple, clear language (no jargon without explanation)
- One concept at a time
- Visual descriptions ("the knight is attacking the queen")
- Encouragement and positive framing
- Questions to check understanding

Avoid overwhelming with variations. Focus on ONE key idea.
Explain chess terms when you use them.`
        }
    },

    /**
     * Build the complete prompt for the LLM
     * @param {Object} context - The chess context
     * @param {string} context.userQuestion - The user's question
     * @param {string} context.fen - Current position FEN
     * @param {string} context.pgn - Game PGN (optional)
     * @param {Object} context.evaluation - Engine evaluation (optional)
     * @param {string} context.explanationMode - One of: human, engine, classical, beginner
     * @param {string} context.gameMode - Current game mode: analysis, engine, human, eve
     * @param {Array} context.chatHistory - Previous messages (optional)
     * @param {Array} context.legalMoves - Legal moves in SAN notation (optional)
     * @returns {Object} - { systemPrompt, userPrompt, metadata }
     */
    buildPrompt(context) {
        const {
            userQuestion,
            fen,
            pgn = null,
            evaluation = null,
            explanationMode = 'human',
            gameMode = 'analysis',
            chatHistory = [],
            legalMoves = []
        } = context;

        // Get mode configuration
        const mode = this.MODES[explanationMode] || this.MODES.human;

        // Build system prompt
        const systemPrompt = this._buildSystemPrompt(mode, gameMode);

        // Build user prompt with context
        const userPrompt = this._buildUserPrompt({
            userQuestion,
            fen,
            pgn,
            evaluation,
            gameMode,
            legalMoves
        });

        // Build messages array for chat API
        const messages = this._buildMessages(systemPrompt, userPrompt, chatHistory);

        return {
            systemPrompt,
            userPrompt,
            messages,
            metadata: {
                mode: explanationMode,
                gameMode,
                hasPGN: !!pgn,
                hasEval: !!evaluation,
                historyLength: chatHistory.length
            }
        };
    },

    /**
     * Build the system prompt with mode-specific instructions
     */
    _buildSystemPrompt(mode, gameMode) {
        let prompt = mode.systemPrompt;

        // Add game mode context
        const gameModeContext = {
            analysis: '\n\nContext: The user is analyzing a position (no active game).',
            engine: '\n\nContext: The user is playing against the engine.',
            human: '\n\nContext: The user is playing against another human.',
            eve: '\n\nContext: The user is watching an Engine vs Engine battle.'
        };

        prompt += gameModeContext[gameMode] || gameModeContext.analysis;

        // Add universal guidelines
        prompt += `

GUIDELINES:
- Always reference the actual position when explaining
- If asked about a move, explain both WHY it's good AND potential alternatives
- Ask reflective questions to deepen understanding when appropriate
- Be concise but complete - respect the user's time
- If the position has a critical tactical theme, mention it
- Never make up moves that aren't legal in the position`;

        return prompt;
    },

    /**
     * Build the user message with board context
     */
    _buildUserPrompt({ userQuestion, fen, pgn, evaluation, gameMode, legalMoves }) {
        let prompt = '';

        // Position context (always included)
        prompt += `CURRENT POSITION (FEN): ${fen}\n\n`;

        // Parse FEN for readable context
        const positionInfo = this._parseFENContext(fen);
        prompt += `POSITION SUMMARY:\n${positionInfo}\n\n`;

        // Legal moves (to prevent hallucination)
        if (legalMoves && legalMoves.length > 0) {
            prompt += `LEGAL MOVES IN THIS POSITION:\n${legalMoves.join(', ')}\n\n`;
            prompt += `IMPORTANT: Only reference moves from this list. Do not suggest illegal moves.\n\n`;
        }

        // PGN if available
        if (pgn && pgn.trim()) {
            // Truncate very long PGNs
            const truncatedPGN = pgn.length > 1000
                ? pgn.substring(0, 1000) + '... [truncated]'
                : pgn;
            prompt += `GAME MOVES:\n${truncatedPGN}\n\n`;
        }

        // Engine evaluation if available
        if (evaluation) {
            prompt += `ENGINE EVALUATION:\n`;
            if (evaluation.score !== undefined) {
                const scoreStr = evaluation.mate
                    ? `Mate in ${evaluation.mate}`
                    : `${evaluation.score > 0 ? '+' : ''}${(evaluation.score / 100).toFixed(2)}`;
                prompt += `- Score: ${scoreStr}\n`;
            }
            if (evaluation.depth) {
                prompt += `- Depth: ${evaluation.depth}\n`;
            }
            if (evaluation.bestMove) {
                prompt += `- Best move: ${evaluation.bestMove}\n`;
            }
            if (evaluation.pv) {
                prompt += `- Principal variation: ${evaluation.pv}\n`;
            }
            prompt += '\n';
        }

        // User's question
        prompt += `USER QUESTION: ${userQuestion}`;

        return prompt;
    },

    /**
     * Parse FEN to provide human-readable context
     */
    _parseFENContext(fen) {
        try {
            const parts = fen.split(' ');
            const position = parts[0];
            const turn = parts[1] === 'w' ? 'White' : 'Black';
            const castling = parts[2] || '-';
            const enPassant = parts[3] || '-';
            const halfmove = parts[4] || '0';
            const fullmove = parts[5] || '1';

            // Count material
            const material = this._countMaterial(position);

            let context = `- ${turn} to move (move ${fullmove})\n`;
            context += `- Material: White ${material.white}, Black ${material.black}\n`;

            if (castling !== '-') {
                const castleRights = [];
                if (castling.includes('K')) castleRights.push('White O-O');
                if (castling.includes('Q')) castleRights.push('White O-O-O');
                if (castling.includes('k')) castleRights.push('Black O-O');
                if (castling.includes('q')) castleRights.push('Black O-O-O');
                context += `- Castling: ${castleRights.join(', ')}\n`;
            } else {
                context += `- No castling rights\n`;
            }

            if (enPassant !== '-') {
                context += `- En passant possible on ${enPassant}\n`;
            }

            return context;
        } catch (e) {
            return '- Unable to parse position details';
        }
    },

    /**
     * Count material from FEN position string
     */
    _countMaterial(position) {
        const pieceValues = { 'Q': 9, 'R': 5, 'B': 3, 'N': 3, 'P': 1 };
        let white = 0, black = 0;

        for (const char of position) {
            const upper = char.toUpperCase();
            if (pieceValues[upper]) {
                if (char === upper) {
                    white += pieceValues[upper];
                } else {
                    black += pieceValues[upper];
                }
            }
        }

        return { white, black };
    },

    /**
     * Build messages array for chat API (OpenAI format)
     */
    _buildMessages(systemPrompt, userPrompt, chatHistory) {
        const messages = [
            { role: 'system', content: systemPrompt }
        ];

        // Add chat history (last N messages to keep context manageable)
        const MAX_HISTORY = 10;
        const recentHistory = chatHistory.slice(-MAX_HISTORY);

        for (const msg of recentHistory) {
            messages.push({
                role: msg.role, // 'user' or 'assistant'
                content: msg.content
            });
        }

        // Add current user message
        messages.push({ role: 'user', content: userPrompt });

        return messages;
    },

    /**
     * Generate quick prompts for common actions
     */
    quickPrompts: {
        analyzePosition: (fen) => ({
            userQuestion: "Analyze this position. What are the key features and plans for both sides?",
            fen
        }),

        explainLastMove: (fen, lastMove) => ({
            userQuestion: `Why is ${lastMove} a good move here? What does it accomplish?`,
            fen
        }),

        suggestPlan: (fen, color) => ({
            userQuestion: `What should ${color} be planning in this position?`,
            fen
        }),

        findTactics: (fen) => ({
            userQuestion: "Are there any tactical opportunities in this position?",
            fen
        }),

        compareMove: (fen, move1, move2) => ({
            userQuestion: `Compare ${move1} vs ${move2}. Which is better and why?`,
            fen
        })
    }
};

// Export for use in browser and Node.js
if (typeof module !== 'undefined' && module.exports) {
    module.exports = MentorPrompts;
}
