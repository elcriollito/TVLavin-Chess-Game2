# Chess-LLM Platform

A modern chess application with dual AI intelligence: classical Stockfish engine + LLM-powered human-like opponent.

## Features

### ✅ Phase 1 (Current)
- 🤖 **LLM Integration**: Claude Haiku/Sonnet or GPT-4o for human-like chess playing
- 🐟 **Stockfish Engine**: Deep analysis with multi-PV, eval, depth tracking
- 🎯 **Multiple Game Modes**:
  - Human vs Stockfish
  - Human vs LLM
  - LLM vs Stockfish
  - LLM vs LLM (Arena mode with auto-play)
- 🎨 **Playing Styles**: Aggressive, Defensive, Positional, Tactical, Creative
- 💭 **LLM Reasoning Display**: See how the AI thinks about each move
- ⚙️ **Customizable Settings**: Temperature, skill level, search depth, multi-PV
- 🎮 **Clean UI**: Dark theme, responsive grid layout

### 🚀 Coming Soon (Phase 2-4)
- Analysis mode with position exploration
- Tournament system (LLM vs LLM, different configs)
- Backend for game persistence
- Multiplayer support
- Opening book integration
- Blunder detection and explanations

## Tech Stack

- **Frontend**: React 18 + TypeScript + Vite
- **State Management**: Zustand
- **Chess Logic**: chess.js
- **Board UI**: react-chessboard
- **Engine**: Stockfish.js (Web Worker)
- **LLM**: Claude API (Anthropic) or OpenAI API

## Setup

### Prerequisites

- Node.js 18+ and npm
- API key for Claude (Anthropic) or GPT-4o (OpenAI)

### Installation

1. **Clone and install dependencies**:
   ```bash
   cd chess-llm-platform
   npm install
   ```

2. **Stockfish Already Included**:
   - ✅ `stockfish.js` is already downloaded in `public/stockfish/stockfish.js` (1.6MB)
   - If missing, download from: [CDNJS Stockfish](https://cdnjs.cloudflare.com/ajax/libs/stockfish.js/10.0.2/stockfish.js)

3. **Get API Key**:
   - **Claude**: Sign up at [console.anthropic.com](https://console.anthropic.com)
   - **OpenAI**: Sign up at [platform.openai.com](https://platform.openai.com)

4. **Start development server**:
   ```bash
   npm run dev
   ```

5. **Open browser**:
   - Navigate to `http://localhost:3000`
   - Enter your API key in the LLM panel settings
   - Choose a game mode and start playing!

## Usage

### Game Modes

1. **Human vs Stockfish**: Traditional chess against computer
2. **Human vs LLM**: Play against AI that explains its moves
3. **LLM vs Stockfish**: Watch AI play against classical engine
4. **LLM vs LLM**: AI arena mode (click "Start Auto-Play" to watch)

### LLM Settings

- **Model**: Choose between Claude Haiku (fast), Sonnet (strong), or GPT-4o
- **Playing Style**:
  - Aggressive: Attacks, sacrifices, initiative
  - Defensive: Solid play, prophylaxis
  - Positional: Long-term strategy, square control
  - Tactical: Sharp calculations, combinations
  - Creative: Surprising, unconventional moves
- **Temperature**: 0.0 (deterministic) to 2.0 (creative)
- **Show Thinking**: Display LLM reasoning for each move

### Engine Settings

- **Skill Level**: 0-20 (beginner to master)
- **Multi-PV**: Show top 1-5 best moves
- **Search Depth**: 5-30 (deeper = stronger but slower)

## Project Structure

```
chess-llm-platform/
├── src/
│   ├── adapters/
│   │   ├── StockfishAdapter.ts    # UCI protocol, engine communication
│   │   └── LLMAdapter.ts           # Claude/OpenAI API integration
│   ├── components/
│   │   ├── BoardPanel.tsx          # Chess board UI
│   │   ├── EnginePanel.tsx         # Stockfish analysis display
│   │   ├── LLMPanel.tsx            # LLM controls and reasoning
│   │   ├── ControlsPanel.tsx       # Game controls, settings
│   │   └── GameModeSelector.tsx    # Mode selection UI
│   ├── store/
│   │   ├── types.ts                # TypeScript interfaces
│   │   └── gameStore.ts            # Zustand state management
│   ├── App.tsx                     # Main app layout
│   └── main.tsx                    # Entry point
├── public/
│   └── stockfish/
│       └── stockfish.js            # Stockfish engine worker
└── package.json
```

## Development

### Build for production

```bash
npm run build
```

### Preview production build

```bash
npm run preview
```

### Type checking

```bash
npx tsc --noEmit
```

## API Costs

Approximate costs per game (20-30 moves):

- **Claude Haiku**: ~$0.01-0.03 per game (recommended)
- **Claude Sonnet**: ~$0.10-0.15 per game (stronger)
- **GPT-4o**: ~$0.05-0.08 per game

Tips to reduce costs:
- Use Haiku model for casual play
- Enable Turbo mode (faster timeout = less tokens)
- Cache responses (future feature)

## Troubleshooting

### Stockfish not loading

- Ensure `stockfish.js` is in `public/stockfish/`
- Check browser console for worker errors
- Try downloading a different Stockfish.js version

### LLM errors

- **"No API key configured"**: Enter API key in LLM panel settings
- **"Failed after 3 attempts"**: Check API key, internet connection, API quota
- **"Illegal move"**: LLM sometimes suggests invalid moves, it will retry automatically
- **Timeout**: Enable Turbo mode or increase timeout in LLMAdapter.ts

### Board not rendering

- Clear browser cache
- Check react-chessboard version compatibility
- Ensure CSS is loading properly

## Contributing

This is a personal project, but suggestions and feedback are welcome!

## License

MIT

## Credits

- **Stockfish**: Open-source chess engine
- **chess.js**: Chess logic library
- **react-chessboard**: React chess board component
- **Anthropic/OpenAI**: LLM APIs

---

**Built with ♟️ by [Your Name]**
