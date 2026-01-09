# TVLavin Chess - Client Application

A modern chess web application built with React, TypeScript, and Stockfish engine integration.

## Features

- ♟️ **Play vs Stockfish Engine** - Adjustable difficulty levels (1-20)
- 📊 **Real-time Analysis** - Live position evaluation with depth and nodes
- ⏱️ **Time Controls** - 3min, 5min, 10min, or unlimited
- 📜 **Move History** - Navigate through game moves with PGN export
- 🎨 **Professional UI** - Fritz Classic color palette with responsive design
- 🔄 **FEN Support** - Load custom positions from FEN strings
- 📱 **Mobile Responsive** - Works on desktop and mobile devices

## Tech Stack

- **React 18** - UI framework
- **TypeScript** - Type safety
- **Vite** - Build tool
- **TailwindCSS** - Styling
- **chess.js** - Chess game logic
- **react-chessboard** - Chess board UI
- **Stockfish** - Chess engine
- **framer-motion** - Animations
- **@tanstack/react-query** - Data fetching
- **Radix UI** - Accessible components

## Prerequisites

- Node.js 18+ and npm
- Stockfish worker file at `/public/stockfish-worker.js` (already included in root project)

## Installation

```bash
# Navigate to client directory
cd client

# Install dependencies
npm install

# Start development server
npm run dev
```

The application will be available at `http://localhost:3000`

## Building for Production

```bash
# Build the application
npm run build

# Preview production build
npm run preview
```

## Project Structure

```
client/
├── src/
│   ├── components/       # React components
│   │   ├── ui/          # Radix UI components
│   │   ├── AnalysisPanel.tsx
│   │   ├── ChessBoardWrapper.tsx
│   │   ├── EngineSettingsPanel.tsx
│   │   ├── GameStatusPanel.tsx
│   │   └── NewGameDialog.tsx
│   ├── hooks/           # Custom React hooks
│   │   ├── use-games.ts
│   │   └── use-stockfish.ts
│   ├── lib/             # Utilities
│   │   ├── utils.ts
│   │   └── queryClient.ts
│   ├── pages/           # Route pages
│   │   ├── Home.tsx
│   │   └── not-found.tsx
│   ├── App.tsx          # Main app component
│   ├── main.tsx         # Entry point
│   └── index.css        # Global styles
├── public/              # Static assets
├── index.html           # HTML template
├── package.json
├── tsconfig.json
├── vite.config.ts
└── tailwind.config.js
```

## Key Components

### ChessBoardWrapper
Responsive chess board with drag-and-drop piece movement, animations, and Fritz Classic styling.

### AnalysisPanel
Real-time engine analysis display showing evaluation, depth, nodes, and best line (PV).

### GameStatusPanel
Game status, timer clocks, move history with navigation, and PGN export functionality.

### EngineSettingsPanel
Configure engine difficulty, player color, load FEN positions, and quick actions.

### NewGameDialog
Start new games with customizable settings: mode, time control, color, and difficulty.

## Custom Hooks

### useStockfish
Manages Stockfish engine communication via Web Worker:
- UCI protocol handling
- Position evaluation
- Best move calculation
- Skill level configuration

### useGames
React Query hooks for game persistence:
- `useGames()` - Fetch all games
- `useGame(id)` - Fetch single game
- `useCreateGame()` - Create new game

## Styling

The application uses a custom Fritz Classic color palette:
- Board colors: `#f0d9b5` (light) and `#b58863` (dark)
- Primary color: `#2c5f9e` (blue)
- Accent color: `#ff9800` (orange)
- Fonts: Inter (sans-serif) and Roboto Mono (monospace)

## Configuration

### Vite Config
- Path aliases: `@/` maps to `./src/`
- API proxy: `/api` proxies to `http://localhost:5000`
- Dev server port: 3000

### TypeScript
- Strict mode enabled
- Path mapping configured for `@/` imports
- ESNext module resolution

## Usage

### Starting a New Game

1. Click "New Game" button
2. Select game mode (vs Engine or Analysis)
3. Choose time control (3m, 5m, 10m, or unlimited)
4. Pick your color (White or Black)
5. Set engine difficulty (1-20)
6. Click "Start Game"

### During the Game

- **Make moves**: Drag and drop pieces on the board
- **Flip board**: Click "Flip Board" in settings panel
- **Analyze position**: Click "Analyze" button to toggle engine analysis
- **Navigate history**: Use arrow buttons to review previous moves
- **Export PGN**: Click download icon to save game

### Loading Custom Positions

1. Click "Paste FEN" button
2. Enter FEN string
3. Click "Load Position"

## API Integration

The client expects a backend API at `http://localhost:5000/api` with the following endpoints:

- `GET /api/games` - List all games
- `GET /api/games/:id` - Get single game
- `POST /api/games` - Create new game

## Troubleshooting

### Stockfish Worker Not Loading
Ensure `/stockfish-worker.js` exists in the public directory (or root project).

### TypeScript Errors
Run `npm install` to ensure all type definitions are installed.

### Board Not Rendering
Check browser console for errors. Ensure react-chessboard is properly installed.

### Analysis Not Working
Verify Stockfish worker is loading successfully in browser Network tab.

## License

MIT

## Credits

- **Design**: TVLAVIN
- **Engine**: Stockfish 16 NNUE
- **Libraries**: chess.js, react-chessboard, framer-motion
