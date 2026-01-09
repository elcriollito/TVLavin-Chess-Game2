import { useEffect, useState, useRef } from "react";
import { Chess, type Move } from "chess.js";
import { ChessBoardWrapper } from "@/components/ChessBoardWrapper";
import { GameStatusPanel } from "@/components/GameStatusPanel";
import { AnalysisPanel } from "@/components/AnalysisPanel";
import { EngineSettingsPanel } from "@/components/EngineSettingsPanel";
import { NewGameDialog, type GameSettings } from "@/components/NewGameDialog";
import { useStockfish } from "@/hooks/use-stockfish";
import { useCreateGame } from "@/hooks/use-games";
import { Button } from "@/components/ui/button";
import { Menu } from "lucide-react";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";

function formatTime(seconds: number): string {
  if (seconds <= 0) return "--:--";
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

export default function Home() {
  // Game State
  const [game, setGame] = useState(new Chess());
  const [fen, setFen] = useState(game.fen()); // State to force re-render
  const [history, setHistory] = useState<string[]>([]);
  const [currentMoveIndex, setCurrentMoveIndex] = useState(-1);
  const [orientation, setOrientation] = useState<"white" | "black">("white");

  // Settings
  const [engineLevel, setEngineLevel] = useState(5);
  const [gameMode, setGameMode] = useState<"engine" | "analysis">("engine");
  const [timeControl, setTimeControl] = useState(0);
  const [playerColor, setPlayerColor] = useState<"white" | "black">("white");

  // Timers
  const [whiteTime, setWhiteTime] = useState(0);
  const [blackTime, setBlackTime] = useState(0);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const lastTimeRef = useRef<number>(Date.now());

  // Dialogs
  const [newGameOpen, setNewGameOpen] = useState(false);

  // Hooks
  const { engineReady, engineInfo, evaluatePosition, stopAnalysis, getBestMove, setSkillLevel } = useStockfish();
  const createGameMutation = useCreateGame();

  // Derived state
  const isGameOver = game.isGameOver();
  const turn = game.turn();
  const isPlayerTurn = gameMode === "analysis" || (turn === "w" ? playerColor === "white" : playerColor === "black");

  // Timer Logic
  useEffect(() => {
    if (timeControl === 0 || isGameOver || gameMode === "analysis") {
      if (timerRef.current) clearInterval(timerRef.current);
      return;
    }

    lastTimeRef.current = Date.now();
    timerRef.current = setInterval(() => {
      const now = Date.now();
      const delta = Math.floor((now - lastTimeRef.current) / 1000);

      if (delta >= 1) {
        if (game.turn() === "w") {
          setWhiteTime(prev => Math.max(0, prev - 1));
        } else {
          setBlackTime(prev => Math.max(0, prev - 1));
        }
        lastTimeRef.current = now;
      }
    }, 1000);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [game.turn(), isGameOver, timeControl, gameMode]);

  // Check Flag Fall
  useEffect(() => {
    if (timeControl > 0 && (whiteTime === 0 || blackTime === 0)) {
      // Handle timeout logic if needed (usually just stops game)
      // game.setGameOver() logic is complex in chess.js without custom flags
    }
  }, [whiteTime, blackTime, timeControl]);

  // Engine Move Logic
  useEffect(() => {
    if (gameMode === "engine" && !isGameOver && !isPlayerTurn && engineReady) {
      // Small delay for realism
      const timeout = setTimeout(() => {
        getBestMove(game.fen(), engineLevel, (move) => {
          makeMove({
            from: move.substring(0, 2),
            to: move.substring(2, 4),
            promotion: move.length > 4 ? move.substring(4, 5) : undefined,
          });
        });
      }, 500);
      return () => clearTimeout(timeout);
    }
  }, [game.fen(), gameMode, isGameOver, isPlayerTurn, engineReady, engineLevel]);

  // Analysis Logic
  useEffect(() => {
    if (engineInfo.isCalculating && !isGameOver) {
      evaluatePosition(game.fen());
    }
  }, [game.fen()]); // Re-evaluate on move

  function makeMove(move: { from: string; to: string; promotion?: string }) {
    try {
      const result = game.move(move);
      if (result) {
        setFen(game.fen());
        setHistory(game.history());
        setCurrentMoveIndex(game.history().length - 1);

        // If analyzing, restart analysis for new position
        if (engineInfo.isCalculating) {
          evaluatePosition(game.fen());
        }
        return true;
      }
    } catch (e) {
      return false;
    }
    return false;
  }

  function onDrop(source: string, target: string) {
    if (isGameOver || (!isPlayerTurn && gameMode === "engine")) return false;

    // Auto-promote to Queen for simplicity in UI
    return makeMove({ from: source, to: target, promotion: "q" });
  }

  function handleNewGame(settings: GameSettings) {
    const newGame = new Chess();
    setGame(newGame);
    setFen(newGame.fen());
    setHistory([]);
    setCurrentMoveIndex(-1);

    setGameMode(settings.mode);
    setTimeControl(settings.timeControl);
    setWhiteTime(settings.timeControl);
    setBlackTime(settings.timeControl);
    setPlayerColor(settings.playerColor);
    setEngineLevel(settings.level);

    setOrientation(settings.playerColor);
    stopAnalysis();
  }

  function handleNavigate(action: "first" | "prev" | "next" | "last") {
    // Navigation requires replaying moves from start
    // This is computationally expensive but fine for short chess games
    // Ideally we would cache FENs for every move

    let targetIndex = currentMoveIndex;

    switch (action) {
      case "first": targetIndex = -1; break;
      case "prev": targetIndex = Math.max(-1, currentMoveIndex - 1); break;
      case "next": targetIndex = Math.min(history.length - 1, currentMoveIndex + 1); break;
      case "last": targetIndex = history.length - 1; break;
    }

    // Create temp game to get FEN at target index
    const tempGame = new Chess();
    for (let i = 0; i <= targetIndex; i++) {
      tempGame.move(history[i]);
    }

    // If we are at the end, we can play. If in history, we usually can't play until we return to end.
    // But `chess.js` doesn't support "go to move".
    // We have to reset and re-play.

    setGame(tempGame);
    setFen(tempGame.fen());
    setCurrentMoveIndex(targetIndex);
  }

  function handleExportPGN() {
    const pgn = game.pgn();
    const blob = new Blob([pgn], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `game-${Date.now()}.pgn`;
    a.click();
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <header className="bg-white border-b px-6 py-4 flex items-center justify-between shadow-sm sticky top-0 z-10">
        <h1 className="text-2xl font-bold text-primary flex items-center gap-2">
          <span className="text-3xl">♞</span>
          TVLavin Chess
        </h1>
        <div className="flex gap-2">
          <Button onClick={() => setNewGameOpen(true)} className="hidden md:flex">New Game</Button>
          <Sheet>
            <SheetTrigger asChild>
              <Button variant="outline" size="icon" className="md:hidden">
                <Menu className="h-5 w-5" />
              </Button>
            </SheetTrigger>
            <SheetContent>
              <div className="py-4">
                <EngineSettingsPanel
                  engineLevel={engineLevel}
                  setEngineLevel={setEngineLevel}
                  playerColor={playerColor}
                  setPlayerColor={setPlayerColor}
                  onFlipBoard={() => setOrientation(o => o === "white" ? "black" : "white")}
                  onLoadFen={(f) => {
                    const g = new Chess();
                    try { g.load(f); setGame(g); setFen(g.fen()); } catch {}
                  }}
                  onNewGame={() => setNewGameOpen(true)}
                />
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 p-4 md:p-6 max-w-[1600px] mx-auto w-full grid grid-cols-1 lg:grid-cols-[300px_1fr_300px] gap-6 items-start">

        {/* Left Panel: Status */}
        <aside className="hidden lg:block h-[calc(100vh-140px)] sticky top-24">
          <GameStatusPanel
            game={game}
            turn={game.turn()}
            isGameOver={isGameOver}
            result={isGameOver ? (game.isCheckmate() ? (game.turn() === 'w' ? "0-1" : "1-0") : "1/2-1/2") : null}
            history={history}
            currentMoveIndex={currentMoveIndex}
            whiteTime={whiteTime}
            blackTime={blackTime}
            onNavigate={handleNavigate}
            onExportPGN={handleExportPGN}
            timeControl={timeControl}
          />
        </aside>

        {/* Center: Board */}
        <div className="flex flex-col items-center gap-4 w-full">
          <div className="lg:hidden w-full max-w-[600px]">
             {/* Mobile Status Bar */}
             <div className="flex justify-between items-center bg-muted/30 p-2 rounded mb-2">
                <div className="font-mono font-bold">{formatTime(whiteTime)}</div>
                <div className="font-bold text-primary">{turn === 'w' ? "White" : "Black"}</div>
                <div className="font-mono font-bold">{formatTime(blackTime)}</div>
             </div>
          </div>

          <ChessBoardWrapper
            game={game}
            boardOrientation={orientation}
            onPieceDrop={onDrop}
            arePiecesDraggable={!isGameOver && (isPlayerTurn || gameMode === "analysis")}
          />

          <div className="w-full max-w-[600px]">
            <AnalysisPanel
              engineInfo={engineInfo}
              isAnalyzing={engineInfo.isCalculating}
              onToggleAnalysis={() => {
                if (engineInfo.isCalculating) stopAnalysis();
                else evaluatePosition(game.fen());
              }}
            />
          </div>
        </div>

        {/* Right Panel: Settings */}
        <aside className="hidden lg:block h-auto sticky top-24">
          <EngineSettingsPanel
            engineLevel={engineLevel}
            setEngineLevel={setEngineLevel}
            playerColor={playerColor}
            setPlayerColor={setPlayerColor}
            onFlipBoard={() => setOrientation(o => o === "white" ? "black" : "white")}
            onLoadFen={(f) => {
              const g = new Chess();
              try { g.load(f); setGame(g); setFen(g.fen()); setHistory(g.history()); } catch {}
            }}
            onNewGame={() => setNewGameOpen(true)}
          />
        </aside>

      </main>

      <NewGameDialog
        open={newGameOpen}
        onOpenChange={setNewGameOpen}
        onStartGame={handleNewGame}
      />
    </div>
  );
}
