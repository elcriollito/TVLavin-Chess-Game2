import { create } from 'zustand';
import { Chess } from 'chess.js';
import type {
  GameState,
  EngineState,
  LLMState,
  SettingsState,
  GameMode,
  Move,
} from './types';

interface GameStore {
  // State
  game: GameState;
  engine: EngineState;
  llm: LLMState;
  settings: SettingsState;
  mode: GameMode;

  // Chess.js instance (internal, not serialized)
  _chess: Chess;

  // Actions
  newGame: () => void;
  loadFEN: (fen: string) => void;
  makeMove: (move: { from: string; to: string; promotion?: string }) => boolean;
  undoMove: () => void;

  // Engine actions
  requestEngineAnalysis: () => void;
  updateEngineState: (updates: Partial<EngineState>) => void;

  // LLM actions
  requestLLMMove: () => Promise<void>;
  updateLLMState: (updates: Partial<LLMState>) => void;

  // Settings actions
  updateSettings: (updates: Partial<SettingsState>) => void;
  setGameMode: (mode: GameMode) => void;
}

export const useGameStore = create<GameStore>((set, get) => {
  const chess = new Chess();

  return {
    // ===== INITIAL STATE =====
    game: {
      fen: chess.fen(),
      pgn: chess.pgn(),
      history: [],
      sideToMove: 'w',
      gameOver: false,
      result: null,
      turn: 1,
    },

    engine: {
      eval: null,
      mate: null,
      depth: 0,
      nodes: 0,
      nps: 0,
      pvLines: [],
      busy: false,
      status: 'idle',
      error: null,
    },

    llm: {
      reasoning: '',
      busy: false,
      lastMove: null,
      error: null,
      status: 'idle',
      thinkingTime: 0,
      confidence: null,
    },

    settings: {
      engineSkill: 10,
      multiPV: 3,
      depth: 20,
      llmModel: 'claude-haiku',
      llmApiKey: '',
      temperature: 0.7,
      llmStyle: 'positional',
      thinkingOn: true,
      turboOn: false,
      theme: 'dark',
      boardOrientation: 'white',
      showCoordinates: true,
    },

    mode: {
      white: 'human',
      black: 'stockfish',
      name: 'Human vs Stockfish',
    },

    _chess: chess,

    // ===== ACTIONS =====
    newGame: () => {
      const { _chess } = get();
      _chess.reset();

      set({
        game: {
          fen: _chess.fen(),
          pgn: _chess.pgn(),
          history: [],
          sideToMove: 'w',
          gameOver: false,
          result: null,
          turn: 1,
        },
        engine: {
          eval: null,
          mate: null,
          depth: 0,
          nodes: 0,
          nps: 0,
          pvLines: [],
          busy: false,
          status: 'idle',
          error: null,
        },
        llm: {
          reasoning: '',
          busy: false,
          lastMove: null,
          error: null,
          status: 'idle',
          thinkingTime: 0,
          confidence: null,
        },
      });
    },

    loadFEN: (fen: string) => {
      const { _chess } = get();

      try {
        _chess.load(fen);

        set({
          game: {
            fen: _chess.fen(),
            pgn: _chess.pgn(),
            history: _chess.history({ verbose: true }).map((move) => ({
              from: move.from,
              to: move.to,
              piece: move.piece,
              captured: move.captured,
              promotion: move.promotion,
              san: move.san,
              fen: '', // Would need to track FEN per move
              timestamp: Date.now(),
            })),
            sideToMove: _chess.turn(),
            gameOver: _chess.isGameOver(),
            result: _chess.isGameOver()
              ? (_chess.isCheckmate() ? (_chess.turn() === 'w' ? '0-1' : '1-0') : '1/2-1/2')
              : null,
            turn: _chess.moveNumber(),
          },
        });
      } catch (error) {
        console.error('Invalid FEN:', error);
      }
    },

    makeMove: (move) => {
      const { _chess } = get();

      try {
        const result = _chess.move(move);
        if (!result) return false;

        const moveData: Move = {
          from: result.from,
          to: result.to,
          piece: result.piece,
          captured: result.captured,
          promotion: result.promotion,
          san: result.san,
          fen: _chess.fen(),
          timestamp: Date.now(),
        };

        set((state) => ({
          game: {
            fen: _chess.fen(),
            pgn: _chess.pgn(),
            history: [...state.game.history, moveData],
            sideToMove: _chess.turn(),
            gameOver: _chess.isGameOver(),
            result: _chess.isGameOver()
              ? (_chess.isCheckmate() ? (_chess.turn() === 'w' ? '0-1' : '1-0') : '1/2-1/2')
              : null,
            turn: _chess.moveNumber(),
          },
        }));

        return true;
      } catch (error) {
        console.error('Invalid move:', error);
        return false;
      }
    },

    undoMove: () => {
      const { _chess } = get();
      _chess.undo();

      set((state) => ({
        game: {
          fen: _chess.fen(),
          pgn: _chess.pgn(),
          history: state.game.history.slice(0, -1),
          sideToMove: _chess.turn(),
          gameOver: false,
          result: null,
          turn: _chess.moveNumber(),
        },
      }));
    },

    // ===== ENGINE ACTIONS =====
    requestEngineAnalysis: () => {
      // This will be called by the component, which triggers StockfishAdapter
      set((state) => ({
        engine: {
          ...state.engine,
          busy: true,
          status: 'analyzing',
        },
      }));
    },

    updateEngineState: (updates) => {
      set((state) => ({
        engine: {
          ...state.engine,
          ...updates,
        },
      }));
    },

    // ===== LLM ACTIONS =====
    requestLLMMove: async () => {
      // Placeholder - will be implemented by LLMAdapter
      set((state) => ({
        llm: {
          ...state.llm,
          busy: true,
          status: 'thinking',
        },
      }));

      // Actual LLM call happens in component/adapter
    },

    updateLLMState: (updates) => {
      set((state) => ({
        llm: {
          ...state.llm,
          ...updates,
        },
      }));
    },

    // ===== SETTINGS ACTIONS =====
    updateSettings: (updates) => {
      set((state) => ({
        settings: {
          ...state.settings,
          ...updates,
        },
      }));
    },

    setGameMode: (mode) => {
      set({ mode });
    },
  };
});
