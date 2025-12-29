[![GitHub Repository](https://img.shields.io/badge/GitHub-TVLavin%20Chess%20Game%202-blue?logo=github)](https://github.com/elcriollito/TVLavin-Chess-Game2)

[TVLavin Chess Game 2](https://github.com/elcriollito/TVLavin-Chess-Game2)

# TVLavin Chess - Professional Chess Application

A feature-rich, professional chess application with Fritz-classic 2D design, Stockfish engine integration, and comprehensive analysis tools.

![Version](https://img.shields.io/badge/version-1.0.0-blue)
![License](https://img.shields.io/badge/license-MIT-green)

## 🎯 Features

### Core Functionality
- ✅ **Play vs Stockfish Engine** - Multiple difficulty levels (1-20)
- ✅ **Fritz Classic 2D Design** - Clean, professional appearance
- ✅ **Engine Analysis Panel** - Live evaluation, depth, nodes, and best line
- ✅ **Move History** - Complete game record with navigation
- ✅ **Move Navigation** - Jump to any position in the game
- ✅ **Time Controls** - 3min, 5min, 10min, or no limit
- ✅ **FEN Support** - Load any position for analysis
- ✅ **Edit Board Mode** - Set up custom positions
- ✅ **Game Analysis** - Analyze completed games
- ✅ **Embeddable** - Generate iframe code for your website
- ✅ **Responsive Design** - Works on desktop, tablet, and mobile

### Advanced Features
- Multiple engine strength levels
- Real-time position evaluation
- Move-by-move navigation
- PGN export
- Board orientation flip
- Analysis mode with engine feedback
- Timer/clock with multiple presets
- Professional UI with accessibility

## 🚀 Quick Start

### Option 1: GitHub Pages (Recommended)
1. Fork or clone this repository
2. Go to Settings → Pages
3. Select main branch as source
4. Your app will be live at: `https://yourusername.github.io/tvlavin-chess/`

### Option 2: Local Development
```bash
# Clone the repository
git clone https://github.com/yourusername/tvlavin-chess.git
cd tvlavin-chess

# Open index.html in your browser
# On Mac:
open index.html
# On Windows:
start index.html
# On Linux:
xdg-open index.html
```

No build process or dependencies required!

## 📋 Common Issues & Solutions

### Issue: Board Not Visible

**Cause:** CSS flex container sizing or JavaScript board library not loaded

**Solutions:**
1. Check that `styles.css` is loaded properly
2. Verify CSS variables are set:
   ```css
   :root {
       --board-size: 600px;
   }
   
   .chessboard {
       width: var(--board-size) !important;
       height: var(--board-size) !important;
   }
   ```
3. Ensure board container has explicit dimensions
4. Check browser console for JavaScript errors
5. Verify chessboard.js is loaded from CDN

**Critical CSS Fix:**
```css
.board-container {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    min-width: 0; /* Prevents flex overflow */
}

.chessboard {
    width: 600px !important;
    height: 600px !important;
    display: block !important;
}
```

### Issue: Engine Not Responding

**Cause:** Stockfish worker not loaded or browser compatibility

**Solutions:**
1. Check browser console for errors
2. Ensure internet connection (engine loads from CDN)
3. Try refreshing the page
4. Check if browser supports Web Workers
5. The application has fallback to older Stockfish version

### Issue: Moves Not Working

**Cause:** Game state or turn management

**Solutions:**
1. Ensure it's the correct player's turn
2. Check if navigated away from current position
3. Verify game is not over
4. In engine mode, wait for engine to move

## 🎮 How to Use

### Starting a New Game
1. Click "New Game" button
2. Select game mode: "Play vs Engine" or "Analysis Mode"
3. Choose time control
4. Select your color (if playing vs engine)
5. Set engine difficulty level
6. Click "Start Game"

### Playing Against the Engine
1. Start a new game in "Play vs Engine" mode
2. Choose your color (White or Black)
3. Make moves by dragging pieces
4. Engine will respond automatically
5. Game ends on checkmate, stalemate, or time out

### Analyzing Positions
1. Load a position via "Paste FEN" or play a game
2. Click "Analyze Game" or toggle "Analyze"
3. View evaluation, depth, and best line
4. Navigate through moves with arrow buttons
5. Click on any move in history to jump to it

### Navigation Controls
- **⏮ First** - Jump to starting position
- **◀ Previous** - Go back one move
- **▶ Next** - Go forward one move
- **⏭ Last** - Jump to current position
- **Keyboard:** Arrow keys, Home, End

### Loading Custom Positions
1. Click "Paste FEN"
2. Enter a valid FEN string
3. Click "Load Position"
4. Position is loaded in analysis mode

**Example FEN:**
```
rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1
```

### Embedding the Board
1. Open Menu → "Get Embed Code"
2. Copy the provided iframe code
3. Paste into your website HTML
4. The embedded board shows just the essentials

**Embed Example:**
```html
<iframe src="https://yourusername.github.io/tvlavin-chess/?embed=1" 
        width="700" height="700" frameborder="0"></iframe>
```

## 🏗️ Architecture

### File Structure
```
tvlavin-chess/
├── index.html              # Main HTML structure
├── styles.css              # Fritz-classic styling
├── app.js                  # Main application logic
├── stockfish-worker.js     # Engine interface
└── README.md              # This file
```

### Components

#### 1. Board Management (`app.js`)
- Chess.js for rules and validation
- Chessboard.js for UI rendering
- Move history tracking
- Position navigation

#### 2. Engine Integration (`stockfish-worker.js`)
- Web Worker for non-blocking operation
- UCI protocol communication
- Multiple skill levels
- Real-time analysis

#### 3. UI System (`styles.css`)
- Responsive flex layout
- Fritz-classic 2D design
- Accessibility features
- Mobile-friendly

### State Management
```javascript
const App = {
    game: Chess(),           // Game state
    board: Chessboard(),     // UI board
    engine: StockfishEngine(), // AI engine
    
    // Game settings
    playerColor: 'white',
    engineLevel: 5,
    gameMode: 'engine',
    
    // Navigation
    moveHistory: [],
    currentMoveIndex: -1,
    
    // Timers
    timeControl: 0,
    whiteTime: 0,
    blackTime: 0
}
```

## 🔧 Customization

### Changing Board Colors
Edit `styles.css`:
```css
:root {
    --light-square: #f0d9b5;  /* Light squares */
    --dark-square: #b58863;   /* Dark squares */
    --board-border: #8b7355;  /* Border color */
}
```

### Adjusting Engine Strength
Modify `stockfish-worker.js`:
```javascript
setSkillLevel(level) {
    this.skillLevel = level;
    
    // Adjust search depth
    if (level <= 3) {
        this.searchDepth = 8;   // Fast, weaker
    } else if (level <= 8) {
        this.searchDepth = 12;  // Balanced
    } else {
        this.searchDepth = 20;  // Strong, slower
    }
}
```

### Adding Custom Piece Sets
Replace the piece theme in `index.html`:
```javascript
pieceTheme: 'path/to/your/pieces/{piece}.png'
```

### Modifying Board Size
Edit CSS variables:
```css
:root {
    --board-size: 600px;  /* Desktop */
}

@media (max-width: 992px) {
    :root {
        --board-size: 450px;  /* Tablet */
    }
}
```

## 📱 Responsive Breakpoints

- **Desktop** (>1200px): Full layout with sidebars
- **Tablet** (768px-1200px): Adjusted sizes
- **Mobile** (<768px): Stacked layout

## ⌨️ Keyboard Shortcuts

- `←` / `→` - Navigate moves
- `Home` / `End` - Jump to start/end
- `Ctrl+N` - New game
- `Ctrl+F` - Flip board

## 🌐 Browser Support

- ✅ Chrome 60+
- ✅ Firefox 55+
- ✅ Safari 11+
- ✅ Edge 79+
- ✅ Opera 47+

**Requirements:**
- JavaScript enabled
- Web Workers support
- ES6+ support

## 📦 Dependencies

All loaded from CDN - no npm install needed:

- **chess.js** (0.10.3) - Chess logic
- **chessboard.js** (1.0.0) - Board UI
- **stockfish.wasm** (0.11.0) - Chess engine
- **Font Awesome** (6.4.0) - Icons

## 🚢 Deployment

### GitHub Pages
```bash
# Push to main branch
git add .
git commit -m "Deploy chess application"
git push origin main

# Enable Pages in Settings
# Your site: https://username.github.io/tvlavin-chess/
```

### Custom Domain
1. Add CNAME file with your domain
2. Configure DNS settings
3. Enable HTTPS in GitHub Pages settings

### Other Platforms

**Netlify:**
```bash
# Drag and drop folder to netlify.com
# Or use Netlify CLI
netlify deploy --prod
```

**Vercel:**
```bash
vercel --prod
```

**AWS S3:**
```bash
aws s3 sync . s3://your-bucket --acl public-read
```

## 🐛 Debugging

### Enable Debug Mode
Open browser console and run:
```javascript
window.App.debug = true;
```

### Check Engine Status
```javascript
console.log(window.App.engine.ready);
console.log(window.App.engine.analyzing);
```

### Inspect Game State
```javascript
console.log(window.App.game.fen());
console.log(window.App.game.pgn());
console.log(window.App.moveHistory);
```

## 🤝 Contributing

Contributions welcome! Please:
1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## 📄 License

MIT License - feel free to use in your projects!

## 🙏 Credits

- **Design collaboration:** TVLAVIN
- **Engine:** Stockfish 16 NNUE
- **Libraries:** chess.js, chessboard.js
- **Piece Set:** Wikipedia Commons

## 📞 Support

Having issues? 
1. Check this README
2. Search existing GitHub issues
3. Open a new issue with details

## 🔄 Version History

### v1.0.0 (2024)
- Initial release
- Fritz-classic design
- Stockfish integration
- Full feature set
- Mobile responsive
- Accessibility features

---

**Enjoy playing chess!** ♟️

Made with ❤️ for chess enthusiasts worldwide
