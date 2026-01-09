import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Activity, Play, Square } from "lucide-react";
import { type EngineInfo } from "@/hooks/use-stockfish";
import { cn } from "@/lib/utils";

interface AnalysisPanelProps {
  engineInfo: EngineInfo;
  isAnalyzing: boolean;
  onToggleAnalysis: () => void;
}

export function AnalysisPanel({
  engineInfo,
  isAnalyzing,
  onToggleAnalysis,
}: AnalysisPanelProps) {

  const formatScore = (score: EngineInfo["score"]) => {
    if (!score) return "0.00";
    if (score.type === "mate") {
      return `M${score.value}`;
    }
    // Centipawns to pawn units
    const pawnScore = (score.value / 100).toFixed(2);
    return score.value > 0 ? `+${pawnScore}` : pawnScore;
  };

  const scoreColor = (() => {
    if (!engineInfo.score) return "text-primary";
    const val = engineInfo.score.value;
    if (val > 50) return "text-green-600";
    if (val < -50) return "text-red-600";
    return "text-primary";
  })();

  return (
    <Card className="mt-4">
      <CardHeader className="pb-2 flex flex-row items-center justify-between">
        <CardTitle className="text-lg font-bold flex items-center gap-2">
          <Activity className="h-5 w-5 text-accent" />
          Engine Analysis
        </CardTitle>
        <Button
          size="sm"
          variant={isAnalyzing ? "destructive" : "default"}
          onClick={onToggleAnalysis}
          className="gap-2"
        >
          {isAnalyzing ? <Square className="h-3 w-3 fill-current" /> : <Play className="h-3 w-3 fill-current" />}
          {isAnalyzing ? "Stop" : "Analyze"}
        </Button>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-3 gap-4 mb-4">
          <div className="bg-muted/50 p-3 rounded text-center">
            <div className="text-xs text-muted-foreground uppercase font-bold tracking-wider mb-1">Eval</div>
            <div className={cn("text-xl font-mono font-bold", scoreColor)}>
              {formatScore(engineInfo.score)}
            </div>
          </div>
          <div className="bg-muted/50 p-3 rounded text-center">
            <div className="text-xs text-muted-foreground uppercase font-bold tracking-wider mb-1">Depth</div>
            <div className="text-xl font-mono font-bold text-foreground">
              {engineInfo.depth}
            </div>
          </div>
          <div className="bg-muted/50 p-3 rounded text-center">
            <div className="text-xs text-muted-foreground uppercase font-bold tracking-wider mb-1">Nodes</div>
            <div className="text-xl font-mono font-bold text-foreground">
              {(engineInfo.nodes / 1000).toFixed(1)}k
            </div>
          </div>
        </div>

        <div className="bg-muted/30 p-4 rounded border border-border">
          <div className="text-xs text-muted-foreground uppercase font-bold tracking-wider mb-2">Best Line</div>
          <div className="font-mono text-sm leading-relaxed break-words text-primary">
            {engineInfo.pv || "..."}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
