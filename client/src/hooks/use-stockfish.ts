import { useEffect, useRef, useState, useCallback } from "react";

export interface Evaluation {
  type: "cp" | "mate";
  value: number; // Centipawns or moves to mate
}

export interface EngineInfo {
  depth: number;
  score?: Evaluation;
  nodes: number;
  pv: string; // Best line
  isCalculating: boolean;
}

export function useStockfish() {
  const workerRef = useRef<Worker | null>(null);
  const [engineReady, setEngineReady] = useState(false);
  const [engineInfo, setEngineInfo] = useState<EngineInfo>({
    depth: 0,
    nodes: 0,
    pv: "",
    isCalculating: false,
  });

  useEffect(() => {
    // Initialize worker
    try {
      const worker = new Worker("/stockfish-worker.js");
      workerRef.current = worker;

      worker.onmessage = (e) => {
        const msg = e.data;

        if (msg === "uciok") {
          setEngineReady(true);
        } else if (msg === "readyok") {
          setEngineInfo(prev => ({ ...prev, isCalculating: false }));
        } else if (typeof msg === "string") {
          parseUciMessage(msg);
        }
      };

      worker.postMessage("uci");

      return () => {
        worker.terminate();
      };
    } catch (err) {
      console.error("Failed to load Stockfish worker:", err);
    }
  }, []);

  const parseUciMessage = (msg: string) => {
    if (msg.startsWith("info depth")) {
      const depthMatch = msg.match(/depth (\d+)/);
      const scoreMatch = msg.match(/score (cp|mate) (-?\d+)/);
      const nodesMatch = msg.match(/nodes (\d+)/);
      const pvMatch = msg.match(/ pv (.+)/);

      setEngineInfo((prev) => ({
        ...prev,
        isCalculating: true,
        depth: depthMatch ? parseInt(depthMatch[1]) : prev.depth,
        score: scoreMatch
          ? {
              type: scoreMatch[1] as "cp" | "mate",
              value: parseInt(scoreMatch[2]),
            }
          : prev.score,
        nodes: nodesMatch ? parseInt(nodesMatch[1]) : prev.nodes,
        pv: pvMatch ? pvMatch[1] : prev.pv,
      }));
    } else if (msg.startsWith("bestmove")) {
      setEngineInfo((prev) => ({ ...prev, isCalculating: false }));
      // Optionally handle bestmove event
    }
  };

  const evaluatePosition = useCallback((fen: string, depth: number = 15) => {
    if (!workerRef.current || !engineReady) return;

    workerRef.current.postMessage("stop");
    workerRef.current.postMessage(`position fen ${fen}`);
    workerRef.current.postMessage(`go depth ${depth}`);

    setEngineInfo(prev => ({ ...prev, isCalculating: true }));
  }, [engineReady]);

  const stopAnalysis = useCallback(() => {
    if (workerRef.current) {
      workerRef.current.postMessage("stop");
      setEngineInfo(prev => ({ ...prev, isCalculating: false }));
    }
  }, []);

  const setSkillLevel = useCallback((level: number) => {
    if (workerRef.current && engineReady) {
      // Stockfish skill level is usually 0-20
      const skill = Math.max(0, Math.min(20, level));
      workerRef.current.postMessage(`setoption name Skill Level value ${skill}`);
    }
  }, [engineReady]);

  const getBestMove = useCallback((fen: string, level: number, callback: (move: string) => void) => {
    if (!workerRef.current || !engineReady) return;

    // Set level first
    setSkillLevel(level);

    // One-time listener for this specific move request
    const tempHandler = (e: MessageEvent) => {
      const msg = e.data;
      if (typeof msg === "string" && msg.startsWith("bestmove")) {
        const move = msg.split(" ")[1];
        callback(move);
        workerRef.current?.removeEventListener("message", tempHandler);
      }
    };
    workerRef.current.addEventListener("message", tempHandler);

    workerRef.current.postMessage(`position fen ${fen}`);

    // Adjust think time based on level roughly
    const moveTime = Math.max(50, level * 100);
    workerRef.current.postMessage(`go movetime ${moveTime}`);
  }, [engineReady, setSkillLevel]);

  return {
    engineReady,
    engineInfo,
    evaluatePosition,
    stopAnalysis,
    setSkillLevel,
    getBestMove,
  };
}
