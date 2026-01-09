import { useGameStore } from '../store/gameStore';
import { GameModeSelector } from './GameModeSelector';

export function ControlsPanel() {
  const { newGame, undoMove, settings, updateSettings, game } = useGameStore();

  return (
    <div className="controls-panel">
      <h2>Controls</h2>

      <div className="button-group">
        <button onClick={newGame} className="primary-button">
          🔄 New Game
        </button>
        <button onClick={undoMove} disabled={game.history.length === 0} className="secondary-button">
          ⬅ Undo
        </button>
      </div>

      {/* Game Mode Selector */}
      <GameModeSelector />

      {/* Settings */}
      <div className="settings-section">
        <h3>⚙ Engine Settings</h3>
        <div className="settings">
          <label>
            <span className="label-text">Skill Level: {settings.engineSkill}</span>
            <input
              type="range"
              min="0"
              max="20"
              value={settings.engineSkill}
              onChange={(e) => updateSettings({ engineSkill: parseInt(e.target.value) })}
            />
            <span className="range-labels">
              <span>Beginner</span>
              <span>Master</span>
            </span>
          </label>

          <label>
            <span className="label-text">Multi-PV: {settings.multiPV}</span>
            <input
              type="range"
              min="1"
              max="5"
              value={settings.multiPV}
              onChange={(e) => updateSettings({ multiPV: parseInt(e.target.value) })}
            />
            <span className="range-labels">
              <span>1 line</span>
              <span>5 lines</span>
            </span>
          </label>

          <label>
            <span className="label-text">Search Depth: {settings.depth}</span>
            <input
              type="range"
              min="5"
              max="30"
              value={settings.depth}
              onChange={(e) => updateSettings({ depth: parseInt(e.target.value) })}
            />
            <span className="range-labels">
              <span>Fast</span>
              <span>Deep</span>
            </span>
          </label>
        </div>
      </div>

      <div className="settings-section">
        <h3>🎨 UI Settings</h3>
        <div className="settings">
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={settings.showCoordinates}
              onChange={(e) => updateSettings({ showCoordinates: e.target.checked })}
            />
            <span>Show Board Coordinates</span>
          </label>

          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={settings.turboOn}
              onChange={(e) => updateSettings({ turboOn: e.target.checked })}
            />
            <span>Turbo Mode (Faster AI)</span>
          </label>

          <label>
            <span className="label-text">Board Orientation</span>
            <select
              value={settings.boardOrientation}
              onChange={(e) => updateSettings({ boardOrientation: e.target.value as 'white' | 'black' })}
            >
              <option value="white">White Bottom</option>
              <option value="black">Black Bottom</option>
            </select>
          </label>
        </div>
      </div>

      {/* Game Info */}
      <div className="game-info">
        <div className="info-row">
          <span className="info-label">Turn:</span>
          <span className="info-value">{game.turn}</span>
        </div>
        <div className="info-row">
          <span className="info-label">To Move:</span>
          <span className="info-value">{game.sideToMove === 'w' ? 'White' : 'Black'}</span>
        </div>
        <div className="info-row">
          <span className="info-label">Moves:</span>
          <span className="info-value">{game.history.length}</span>
        </div>
        {game.gameOver && (
          <div className="info-row game-over">
            <span className="info-label">Result:</span>
            <span className="info-value">{game.result}</span>
          </div>
        )}
      </div>
    </div>
  );
}
