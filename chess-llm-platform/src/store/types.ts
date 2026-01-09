// ===== GAME STATE =====
export interface GameState {
  fen: string;
  pgn: string;
  history: Move[];
  sideToMove: 'w' | 'b';
  gameOver: boolean;
  result: string | null; // "1-0", "0-1", "1/2-1/2", null
  turn: number;
}

export interface Move {
  from: string;
  to: string;
  piece: string;
  captured?: string;
  promotion?: string;
  san: string;
  fen: string;
  timestamp: number;
}

// ===== ENGINE STATE =====
export interface EngineState {
  eval: number | null; // Centipawn score (e.g., +120 = +1.20)
  mate: number | null; // Mate in X moves
  depth: number;
  nodes: number;
  nps: number; // Nodes per second
  pvLines: PVLine[];
  busy: boolean;
  status: 'idle' | 'analyzing' | 'thinking' | 'error';
  error: string | null;
}

export interface PVLine {
  depth: number;
  score: number;
  mate: number | null;
  pv: string; // Principal variation (e.g., "e2e4 e7e5 g1f3")
  sanPv?: string; // SAN notation (e.g., "e4 e5 Nf3")
}

// ===== LLM STATE =====
export interface LLMState {
  reasoning: string;
  busy: boolean;
  lastMove: string | null;
  error: string | null;
  status: 'idle' | 'thinking' | 'error';
  thinkingTime: number; // milliseconds
  confidence: number | null; // 0-1
}

// ===== SETTINGS STATE =====
export interface SettingsState {
  // Engine settings
  engineSkill: number; // 0-20
  multiPV: number; // 1-5
  depth: number; // Max search depth

  // LLM settings
  llmModel: 'claude-haiku' | 'claude-sonnet' | 'gpt-4o' | 'local';
  llmApiKey: string;
  temperature: number; // 0.0-2.0
  llmStyle: 'aggressive' | 'defensive' | 'positional' | 'tactical' | 'creative';
  thinkingOn: boolean; // Show reasoning
  turboOn: boolean; // Faster response (less depth)

  // UI settings
  theme: 'dark' | 'light';
  boardOrientation: 'white' | 'black';
  showCoordinates: boolean;
}

// ===== PLAYER MODES =====
export type PlayerType = 'human' | 'stockfish' | 'llm';

export interface GameMode {
  white: PlayerType;
  black: PlayerType;
  name: string; // "Human vs Stockfish", "LLM vs LLM", etc.
}

// ===== ADAPTER CONTRACTS =====
export interface EngineAnalysisOptions {
  depth?: number;
  multiPV?: number;
  timeMs?: number;
}

export interface EngineBestMoveOptions {
  depth?: number;
  skillLevel?: number;
  timeMs?: number;
}

export interface LLMMoveRequest {
  fen: string;
  history: Move[];
  config: {
    temperature: number;
    style?: 'aggressive' | 'defensive' | 'positional' | 'tactical' | 'creative';
    thinkingOn: boolean;
  };
}

export interface LLMMoveResponse {
  moveUci: string; // e.g., "e2e4"
  reasoning: string;
  confidence?: number; // 0-1
  thinkingTime?: number; // milliseconds
}
