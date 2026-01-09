import { useState, useEffect } from 'react';
import { useGameStore } from '../store/gameStore';
import { LLMAdapter } from '../adapters/LLMAdapter';
import './LLMPanel.css';

let llmAdapter: LLMAdapter | null = null;

export function LLMPanel() {
  const { llm, game, settings, mode, updateLLMState, makeMove, updateSettings } = useGameStore();
  const [autoPlay, setAutoPlay] = useState(false);

  // Initialize LLM adapter
  useEffect(() => {
    if (!llmAdapter) {
      llmAdapter = new LLMAdapter({
        apiKey: settings.llmApiKey,
        model: settings.llmModel,
        maxRetries: 3,
        timeout: settings.turboOn ? 5000 : 15000,
      });
    } else {
      llmAdapter.setApiKey(settings.llmApiKey);
      llmAdapter.setModel(settings.llmModel);
    }
  }, [settings.llmApiKey, settings.llmModel, settings.turboOn]);

  // Auto-play for LLM vs LLM mode
  useEffect(() => {
    if (!autoPlay || game.gameOver) return;

    const currentPlayer = game.sideToMove === 'w' ? mode.white : mode.black;

    if (currentPlayer === 'llm' && !llm.busy) {
      // Small delay before making move
      const timer = setTimeout(() => {
        requestMove();
      }, 1000);

      return () => clearTimeout(timer);
    }
  }, [game.fen, autoPlay, game.gameOver, llm.busy]);

  async function requestMove() {
    if (!llmAdapter) {
      updateLLMState({ error: 'LLM adapter not initialized', status: 'error' });
      return;
    }

    updateLLMState({ busy: true, status: 'thinking', error: null });

    try {
      const response = await llmAdapter.getMove({
        fen: game.fen,
        history: game.history,
        config: {
          temperature: settings.temperature,
          style: settings.llmStyle,
          thinkingOn: settings.thinkingOn,
        },
      });

      // Validate and apply move
      const from = response.moveUci.slice(0, 2);
      const to = response.moveUci.slice(2, 4);
      const promotion = response.moveUci.length === 5 ? response.moveUci[4] : undefined;

      const success = makeMove({ from, to, promotion });

      if (!success) {
        throw new Error(`Illegal move: ${response.moveUci}`);
      }

      updateLLMState({
        reasoning: response.reasoning,
        lastMove: response.moveUci,
        confidence: response.confidence || null,
        thinkingTime: response.thinkingTime || 0,
        busy: false,
        status: 'idle',
        error: null,
      });
    } catch (error) {
      updateLLMState({
        error: (error as Error).message,
        busy: false,
        status: 'error',
      });
    }
  }

  function toggleAutoPlay() {
    setAutoPlay(!autoPlay);
  }

  return (
    <div className="llm-panel">
      <div className="panel-header">
        <h2>🤖 LLM Player</h2>
        <div className="status-badge" data-status={llm.status}>
          {llm.status === 'thinking' && '⏳ Thinking...'}
          {llm.status === 'idle' && '✓ Ready'}
          {llm.status === 'error' && '⚠ Error'}
        </div>
      </div>

      {/* Model Selection */}
      <div className="llm-settings">
        <label>
          Model:
          <select
            value={settings.llmModel}
            onChange={(e) => updateSettings({ llmModel: e.target.value as any })}
            disabled={llm.busy}
          >
            <option value="claude-haiku">Claude Haiku (Fast)</option>
            <option value="claude-sonnet">Claude Sonnet (Strong)</option>
            <option value="gpt-4o">GPT-4o</option>
            <option value="local">Local Model</option>
          </select>
        </label>

        <label>
          API Key:
          <input
            type="password"
            value={settings.llmApiKey}
            onChange={(e) => updateSettings({ llmApiKey: e.target.value })}
            placeholder="Enter API key"
            disabled={llm.busy}
          />
        </label>

        <label>
          Playing Style:
          <select
            value={settings.llmStyle}
            onChange={(e) => updateSettings({ llmStyle: e.target.value as any })}
            disabled={llm.busy}
          >
            <option value="aggressive">Aggressive</option>
            <option value="defensive">Defensive</option>
            <option value="positional">Positional</option>
            <option value="tactical">Tactical</option>
            <option value="creative">Creative</option>
          </select>
        </label>

        <label>
          Temperature: {settings.temperature.toFixed(1)}
          <input
            type="range"
            min="0"
            max="2"
            step="0.1"
            value={settings.temperature}
            onChange={(e) => updateSettings({ temperature: parseFloat(e.target.value) })}
            disabled={llm.busy}
          />
        </label>
      </div>

      {/* Controls */}
      <div className="llm-controls">
        <button
          onClick={requestMove}
          disabled={llm.busy || game.gameOver}
          className="primary-button"
        >
          {llm.busy ? (
            <>
              <span className="spinner"></span>
              Thinking...
            </>
          ) : (
            'Request Move'
          )}
        </button>

        {(mode.white === 'llm' && mode.black === 'llm') && (
          <button
            onClick={toggleAutoPlay}
            className={autoPlay ? 'danger-button' : 'secondary-button'}
          >
            {autoPlay ? '⏸ Pause Auto-Play' : '▶ Start Auto-Play'}
          </button>
        )}
      </div>

      {/* Thinking Indicator */}
      {llm.busy && (
        <div className="thinking-indicator">
          <div className="dots">
            <span></span>
            <span></span>
            <span></span>
          </div>
          <p>Analyzing position...</p>
        </div>
      )}

      {/* Reasoning Display */}
      {settings.thinkingOn && llm.reasoning && (
        <div className="reasoning-box">
          <h3>💭 Reasoning:</h3>
          <p>{llm.reasoning}</p>

          <div className="reasoning-meta">
            {llm.lastMove && (
              <span className="meta-item">
                Move: <code>{llm.lastMove}</code>
              </span>
            )}
            {llm.confidence !== null && (
              <span className="meta-item">
                Confidence: {(llm.confidence * 100).toFixed(0)}%
              </span>
            )}
            {llm.thinkingTime > 0 && (
              <span className="meta-item">
                Time: {(llm.thinkingTime / 1000).toFixed(1)}s
              </span>
            )}
          </div>
        </div>
      )}

      {/* Error Display */}
      {llm.error && (
        <div className="error-box">
          <h3>⚠ Error</h3>
          <p>{llm.error}</p>
          <button onClick={() => updateLLMState({ error: null, status: 'idle' })}>
            Dismiss
          </button>
        </div>
      )}

      {/* Help Text */}
      {!settings.llmApiKey && (
        <div className="help-box">
          <p>
            <strong>No API key configured.</strong>
            <br />
            LLM will use mock responses for testing.
            <br />
            Get an API key from{' '}
            <a href="https://console.anthropic.com" target="_blank" rel="noopener">
              Anthropic
            </a>{' '}
            or{' '}
            <a href="https://platform.openai.com" target="_blank" rel="noopener">
              OpenAI
            </a>
            .
          </p>
        </div>
      )}
    </div>
  );
}
