/**
 * CAISSA Mentor AI - Prompt Builder Module
 *
 * This module constructs contextual prompts for the chess mentor AI.
 * It adapts tone and focus based on the selected explanation mode.
 * Supports Stockfish engine-backed guidance for precise evaluations.
 */

const MentorPrompts = {

    // Engine-backed system prompt addition (injected when engineReport is available)
    ENGINE_GUIDANCE_PROMPT: `
You have access to Stockfish engine analysis. You MUST use this data to ground ALL your explanations.

CRITICAL ENGINE GUIDANCE RULES (YOU MUST FOLLOW THESE):
1. ALWAYS start your response by referencing the engine evaluation: "According to the engine (depth X), the position is +0.35..."
2. ALWAYS state evaluations as decimals from White's perspective (e.g., "+0.35" or "-0.12", NEVER "35 centipawns")
3. When comparing moves, you MUST cite BOTH evals: "Nf3 maintains +0.35, while e5 drops to -0.12 (a 0.47 pawn swing)"
4. If a move loses evaluation (>0.3 difference), you MUST explain the CONCRETE threat or tactic that punishes it
5. When the user's move differs from the engine's top choice, explicitly compare them with numbers
6. Reference the principal variation (PV) when explaining WHY a move is best
7. NEVER give vague opinions like "this is a good move" - ALWAYS back it up with the engine eval
8. If the position has a forced mate, lead with "Forced mate in X moves" and show the key line

MOVE COMPARISON GUIDELINES:
- Difference < 0.15 pawns: "Roughly equal alternatives"
- Difference 0.15-0.50 pawns: "Slight inaccuracy" - explain why
- Difference > 0.50 pawns: "Significant mistake" - show the refutation

FORMAT: Be concise. Lead with the engine's verdict. Then explain the WHY using concrete variations.`,

    // No-engine mode prompt (when engineReport is not available)
    NO_ENGINE_PROMPT: `
NOTE: No engine analysis is currently available for this position.
Provide your best assessment based on:
- General chess principles and patterns
- Piece activity and coordination
- Pawn structure and king safety
- Typical plans for similar positions

Be clear that this is your assessment without engine verification.
Phrase opinions as: "In my assessment..." or "Typically in such positions..."`,

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

Explain WHY moves are good using concrete reasoning.
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

Present analysis systematically. Use notation like: 1.e4 e5 2.Nf3 (+0.35)
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
     * @param {Object} context.evaluation - Engine evaluation (optional, legacy)
     * @param {Object} context.engineReport - Full engine report with topMoves (preferred)
     * @param {string} context.explanationMode - One of: human, engine, classical, beginner
     * @param {string} context.gameMode - Current game mode: analysis, engine, human, eve
     * @param {Array} context.chatHistory - Previous messages (optional)
     * @param {Array} context.legalMoves - Legal moves in SAN notation (optional)
     * @param {boolean} context.useStockfishGuidance - Whether to inject engine guidance
     * @returns {Object} - { systemPrompt, userPrompt, messages, engineReport, metadata }
     */
    buildPrompt(context) {
        const {
            userQuestion,
            fen,
            pgn = null,
            evaluation = null,
            engineReport = null,
            explanationMode = 'human',
            gameMode = 'analysis',
            chatHistory = [],
            legalMoves = [],
            useStockfishGuidance = true
        } = context;

        // Get mode configuration
        const mode = this.MODES[explanationMode] || this.MODES.human;

        // Determine if we have valid engine data
        const hasEngineData = engineReport && (engineReport.evalCp !== undefined || engineReport.mateIn !== undefined);

        // Build system prompt (with engine guidance if available)
        const systemPrompt = this._buildSystemPrompt(mode, gameMode, hasEngineData && useStockfishGuidance);

        // Build user prompt with context
        const userPrompt = this._buildUserPrompt({
            userQuestion,
            fen,
            pgn,
            evaluation,
            engineReport: hasEngineData ? engineReport : null,
            gameMode,
            legalMoves,
            useStockfishGuidance
        });

        // Build messages array for chat API
        const messages = this._buildMessages(systemPrompt, userPrompt, chatHistory);

        return {
            systemPrompt,
            userPrompt,
            messages,
            engineReport: hasEngineData ? engineReport : null,
            metadata: {
                mode: explanationMode,
                gameMode,
                hasPGN: !!pgn,
                hasEval: !!evaluation,
                hasEngineReport: hasEngineData,
                useStockfishGuidance: hasEngineData && useStockfishGuidance,
                historyLength: chatHistory.length
            }
        };
    },

    /**
     * Build the system prompt with mode-specific instructions
     * @param {Object} mode - The explanation mode config
     * @param {string} gameMode - Current game mode
     * @param {boolean} includeEngineGuidance - Whether to add engine guidance rules
     */
    _buildSystemPrompt(mode, gameMode, includeEngineGuidance = false) {
        let prompt = mode.systemPrompt;

        // Add engine guidance if available, otherwise add no-engine disclaimer
        if (includeEngineGuidance) {
            prompt += this.ENGINE_GUIDANCE_PROMPT;
        } else {
            prompt += this.NO_ENGINE_PROMPT;
        }

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
- Be concise but complete - respect the user's time
- If the position has a critical tactical theme, mention it
- Never make up moves that aren't legal in the position`;

        return prompt;
    },

    /**
     * Build the user message with board context
     */
    _buildUserPrompt({ userQuestion, fen, pgn, evaluation, engineReport, gameMode, legalMoves, useStockfishGuidance }) {
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

        // Engine report (new format with topMoves) - preferred over legacy evaluation
        if (engineReport && useStockfishGuidance) {
            prompt += `STOCKFISH ENGINE ANALYSIS (depth ${engineReport.depth || '?'}):\n`;

            // Format main evaluation
            if (engineReport.mateIn !== undefined && engineReport.mateIn !== null) {
                const mateStr = engineReport.mateIn > 0 ? `+M${engineReport.mateIn}` : `M${engineReport.mateIn}`;
                prompt += `Position evaluation: ${mateStr} (forced mate)\n`;
            } else if (engineReport.evalCp !== undefined) {
                const evalPawns = (engineReport.evalCp / 100).toFixed(2);
                const evalStr = engineReport.evalCp >= 0 ? `+${evalPawns}` : evalPawns;
                prompt += `Position evaluation: ${evalStr} (from White's perspective)\n`;
            }

            prompt += `Side to move: ${engineReport.sideToMove || 'unknown'}\n\n`;

            // Format top candidate moves
            if (engineReport.topMoves && engineReport.topMoves.length > 0) {
                prompt += `TOP CANDIDATE MOVES:\n`;
                engineReport.topMoves.forEach((move, idx) => {
                    const evalPawns = move.mateIn !== undefined
                        ? (move.mateIn > 0 ? `+M${move.mateIn}` : `M${move.mateIn}`)
                        : ((move.evalCp / 100).toFixed(2));
                    const evalStr = (typeof move.evalCp === 'number' && move.evalCp >= 0 && move.mateIn === undefined)
                        ? `+${evalPawns}` : evalPawns;

                    prompt += `${idx + 1}. ${move.san || move.uci} (${evalStr})`;
                    if (move.pv) {
                        prompt += ` - Line: ${move.pv}`;
                    }
                    if (move.note) {
                        prompt += ` [${move.note}]`;
                    }
                    prompt += '\n';
                });
                prompt += '\n';
            }
        }
        // Legacy evaluation format (fallback)
        else if (evaluation) {
            prompt += `ENGINE EVALUATION:\n`;
            if (evaluation.score !== undefined) {
                const scoreStr = evaluation.mate
                    ? `Mate in ${evaluation.mate}`
                    : `${evaluation.score > 0 ? '+' : ''}${evaluation.score.toFixed(2)}`;
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
