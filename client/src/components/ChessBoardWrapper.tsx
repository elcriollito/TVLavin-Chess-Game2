import { Chessboard } from "react-chessboard";
import { type Chess, type Move } from "chess.js";
import { useEffect, useState } from "react";
import { motion } from "framer-motion";

interface ChessBoardWrapperProps {
  game: Chess;
  boardOrientation: "white" | "black";
  onPieceDrop: (source: string, target: string) => boolean;
  arePiecesDraggable?: boolean;
}

export function ChessBoardWrapper({
  game,
  boardOrientation,
  onPieceDrop,
  arePiecesDraggable = true,
}: ChessBoardWrapperProps) {
  const [boardWidth, setBoardWidth] = useState(600);

  useEffect(() => {
    const handleResize = () => {
      // Calculate responsive width (max 600px, but responsive on mobile)
      const container = document.getElementById("board-container");
      if (container) {
        setBoardWidth(Math.min(container.offsetWidth, 600));
      }
    };

    window.addEventListener("resize", handleResize);
    handleResize(); // Initial calculation

    return () => window.removeEventListener("resize", handleResize);
  }, []);

  return (
    <motion.div
      id="board-container"
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.3 }}
      className="rounded-lg overflow-hidden shadow-xl border-4 border-[#8b7355] bg-[#f0d9b5]"
      style={{ maxWidth: "600px", width: "100%", aspectRatio: "1/1" }}
    >
      <Chessboard
        id="tvlavin-chess-board"
        position={game.fen()}
        boardOrientation={boardOrientation}
        onPieceDrop={onPieceDrop}
        arePiecesDraggable={arePiecesDraggable}
        customBoardStyle={{
          borderRadius: "4px",
          boxShadow: "0 5px 15px rgba(0, 0, 0, 0.5)",
        }}
        customDarkSquareStyle={{ backgroundColor: "#b58863" }}
        customLightSquareStyle={{ backgroundColor: "#f0d9b5" }}
        animationDuration={200}
        boardWidth={boardWidth}
      />
    </motion.div>
  );
}
