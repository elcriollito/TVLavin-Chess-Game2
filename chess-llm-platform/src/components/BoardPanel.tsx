import { useEffect } from 'react';
import { Chessboard } from 'react-chessboard';
import { useGameStore } from '../store/gameStore';
import type { Square } from 'react-chessboard/dist/chessboard/types';

export function BoardPanel() {
  const { game, makeMove, settings, mode } = useGameStore();

  // Handle piece drop (human move)
  function onDrop(sourceSquare: Square, targetSquare: Square) {
    // Check if it's human's turn
    const currentPlayer = game.sideToMove === 'w' ? mode.white : mode.black;
    if (currentPlayer !== 'human') {
      return false; // Not human's turn
    }

    const move = makeMove({
      from: sourceSquare,
      to: targetSquare,
      promotion: 'q', // Auto-queen for now (TODO: add promotion dialog)
    });

    return move;
  }

  return (
    <div className="board-panel">
      <div className="board-header">
        <h2>♟️ Chess Board</h2>
        {game.gameOver && (
          <div className="game-over-badge">
            Game Over: {game.result}
          </div>
        )}
      </div>

      <div className="board-wrapper">
        <Chessboard
          position={game.fen}
          onPieceDrop={onDrop}
          boardOrientation={settings.boardOrientation}
          customBoardStyle={{
            borderRadius: '8px',
            boxShadow: '0 8px 32px rgba(0, 0, 0, 0.6)',
          }}
          customDarkSquareStyle={{ backgroundColor: '#4a5568' }}
          customLightSquareStyle={{ backgroundColor: '#cbd5e0' }}
          showBoardNotation={settings.showCoordinates}
          arePiecesDraggable={!game.gameOver}
        />
      </div>

      <div className="board-footer">
        <div className="turn-indicator">
          <span className={`turn-dot ${game.sideToMove === 'w' ? 'white' : 'black'}`}></span>
          <span className="turn-text">
            {game.sideToMove === 'w' ? 'White' : 'Black'} to move
          </span>
        </div>
        <div className="move-count">
          Move {game.turn}
        </div>
      </div>
    </div>
  );
}
