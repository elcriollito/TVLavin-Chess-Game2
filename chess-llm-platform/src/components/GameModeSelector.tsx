import { useGameStore } from '../store/gameStore';
import type { GameMode } from '../store/types';
import './GameModeSelector.css';

const GAME_MODES: GameMode[] = [
  { white: 'human', black: 'stockfish', name: 'Human vs Stockfish' },
  { white: 'human', black: 'llm', name: 'Human vs LLM' },
  { white: 'stockfish', black: 'human', name: 'Stockfish vs Human' },
  { white: 'llm', black: 'human', name: 'LLM vs Human' },
  { white: 'stockfish', black: 'llm', name: 'Stockfish vs LLM' },
  { white: 'llm', black: 'stockfish', name: 'LLM vs Stockfish' },
  { white: 'llm', black: 'llm', name: 'LLM vs LLM (Arena)' },
];

export function GameModeSelector() {
  const { mode, setGameMode, newGame } = useGameStore();

  function handleModeChange(newMode: GameMode) {
    setGameMode(newMode);
    newGame();
  }

  return (
    <div className="game-mode-selector">
      <h3>Game Mode</h3>
      <div className="mode-grid">
        {GAME_MODES.map((gameMode) => (
          <button
            key={gameMode.name}
            className={`mode-button ${mode.name === gameMode.name ? 'active' : ''}`}
            onClick={() => handleModeChange(gameMode)}
          >
            <div className="mode-players">
              <PlayerIcon type={gameMode.white} color="white" />
              <span className="vs">vs</span>
              <PlayerIcon type={gameMode.black} color="black" />
            </div>
            <div className="mode-name">{gameMode.name}</div>
          </button>
        ))}
      </div>
    </div>
  );
}

function PlayerIcon({ type, color }: { type: 'human' | 'stockfish' | 'llm'; color: 'white' | 'black' }) {
  const icons = {
    human: '👤',
    stockfish: '🐟',
    llm: '🤖',
  };

  return (
    <span className={`player-icon player-${color}`} title={type}>
      {icons[type]}
    </span>
  );
}
