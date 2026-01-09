import { useEffect, useRef } from 'react';
import { useGameStore } from '../store/gameStore';
import { StockfishAdapter } from '../adapters/StockfishAdapter';
import type { StockfishMessage } from '../adapters/StockfishAdapter';

let stockfish: StockfishAdapter | null = null;

export function EnginePanel() {
  const { engine, game, settings, mode, updateEngineState, makeMove } = useGameStore();
  const messageHandlerRef = useRef<((msg: StockfishMessage) => void) | null>(null);

  // Initialize Stockfish once
  useEffect(() => {
    if (!stockfish) {
      stockfish = new StockfishAdapter();

      // Message handler
      const handler = (msg: StockfishMessage) => {
        if (msg.type === 'info' && msg.data) {
          updateEngineState({
            depth: msg.data.depth !== undefined ? msg.data.depth : engine.depth,
            nodes: msg.data.nodes !== undefined ? msg.data.nodes : engine.nodes,
            nps: msg.data.nps !== undefined ? msg.data.nps : engine.nps,
            eval: msg.data.score !== undefined ? msg.data.score : engine.eval,
            mate: msg.data.mate !== undefined ? msg.data.mate : engine.mate,
          });
        } else if (msg.type === 'bestmove') {
          updateEngineState({ busy: false, status: 'idle' });
        } else if (msg.type === 'error') {
          updateEngineState({
            busy: false,
            status: 'error',
            error: 'Engine error occurred'
          });
        }
      };

      messageHandlerRef.current = handler;
      stockfish.onMessage(handler);

      // Set initial options
      stockfish.setSkillLevel(settings.engineSkill);
      stockfish.setMultiPV(settings.multiPV);
    }

    return () => {
      // Cleanup on unmount
      if (stockfish) {
        stockfish.stop();
      }
    };
  }, []);

  // Update engine options when settings change
  useEffect(() => {
    if (stockfish) {
      stockfish.setSkillLevel(settings.engineSkill);
      stockfish.setMultiPV(settings.multiPV);
    }
  }, [settings.engineSkill, settings.multiPV]);

  // Analyze current position
  useEffect(() => {
    if (stockfish && !game.gameOver) {
      updateEngineState({ busy: true, status: 'analyzing' });
      stockfish.analyzePosition(game.fen, {
        depth: settings.depth,
        multiPV: settings.multiPV
      });
    }

    return () => {
      if (stockfish) {
        stockfish.stop();
      }
    };
  }, [game.fen, settings.depth, settings.multiPV]);

  // Auto-play for Stockfish player
  useEffect(() => {
    const currentPlayer = game.sideToMove === 'w' ? mode.white : mode.black;

    if (currentPlayer === 'stockfish' && !game.gameOver && !engine.busy) {
      // Small delay before making move
      const timer = setTimeout(async () => {
        if (stockfish) {
          updateEngineState({ busy: true, status: 'thinking' });

          const move = await stockfish.getBestMove(game.fen, {
            skillLevel: settings.engineSkill,
            depth: settings.turboOn ? 10 : 15,
          });

          // Parse UCI move (e.g., "e2e4" -> from: "e2", to: "e4")
          if (move && move.length >= 4) {
            const from = move.slice(0, 2);
            const to = move.slice(2, 4);
            const promotion = move.length === 5 ? move[4] : undefined;

            makeMove({ from, to, promotion });
          }

          updateEngineState({ busy: false, status: 'idle' });
        }
      }, 500);

      return () => clearTimeout(timer);
    }
  }, [game.fen, mode, game.gameOver, engine.busy]);

  function formatEval(evalScore: number | null, mate: number | null): string {
    if (mate !== null) {
      return `M${mate > 0 ? '+' : ''}${mate}`;
    }
    if (evalScore !== null) {
      const score = evalScore / 100;
      return score > 0 ? `+${score.toFixed(2)}` : score.toFixed(2);
    }
    return '-';
  }

  return (
    <div className="engine-panel">
      <div className="panel-header">
        <h2>🐟 Stockfish Analysis</h2>
        <div className="status-badge" data-status={engine.status}>
          {engine.status === 'analyzing' && '📊 Analyzing'}
          {engine.status === 'thinking' && '🤔 Thinking'}
          {engine.status === 'idle' && '✓ Ready'}
          {engine.status === 'error' && '⚠ Error'}
        </div>
      </div>

      <div className="engine-stats">
        <div className="stat-row">
          <span className="stat-label">Evaluation:</span>
          <span className="stat-value eval-value" data-eval={engine.eval !== null ? (engine.eval > 0 ? 'positive' : 'negative') : 'neutral'}>
            {formatEval(engine.eval, engine.mate)}
          </span>
        </div>
        <div className="stat-row">
          <span className="stat-label">Depth:</span>
          <span className="stat-value">{engine.depth}</span>
        </div>
        <div className="stat-row">
          <span className="stat-label">Nodes:</span>
          <span className="stat-value">{engine.nodes.toLocaleString()}</span>
        </div>
        <div className="stat-row">
          <span className="stat-label">NPS:</span>
          <span className="stat-value">{engine.nps.toLocaleString()}</span>
        </div>
      </div>

      {engine.pvLines.length > 0 && (
        <div className="pv-lines">
          <h3>Principal Variations:</h3>
          {engine.pvLines.slice(0, settings.multiPV).map((line, i) => (
            <div key={i} className="pv-line">
              <div className="pv-header">
                <span className="pv-rank">#{i + 1}</span>
                <span className="pv-score">
                  {formatEval(line.score, line.mate)}
                </span>
              </div>
              <div className="pv-moves">{line.pv || 'No moves'}</div>
            </div>
          ))}
        </div>
      )}

      {engine.error && (
        <div className="error-box">
          <p>{engine.error}</p>
        </div>
      )}
    </div>
  );
}
