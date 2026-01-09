import { BoardPanel } from './components/BoardPanel';
import { EnginePanel } from './components/EnginePanel';
import { LLMPanel } from './components/LLMPanel';
import { ControlsPanel } from './components/ControlsPanel';
import './App.css';

function App() {
  return (
    <div className="app">
      <header className="app-header">
        <h1>♟️ Chess-LLM Platform</h1>
        <p className="subtitle">Dual AI Intelligence: Stockfish + LLM</p>
      </header>

      <div className="app-grid">
        <aside className="sidebar-left">
          <EnginePanel />
        </aside>

        <main className="main-content">
          <BoardPanel />
          <ControlsPanel />
        </main>

        <aside className="sidebar-right">
          <LLMPanel />
        </aside>
      </div>
    </div>
  );
}

export default App;
