import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Chess } from "chess.js";
import {
  ChevronFirst,
  ChevronLast,
  ChevronLeft,
  ChevronRight,
  Clock,
  Download,
  Trophy
} from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";

interface GameStatusPanelProps {
  game: Chess;
  turn: "w" | "b";
  isGameOver: boolean;
  result: string | null;
  history: string[];
  currentMoveIndex: number;
  whiteTime: number;
  blackTime: number;
  onNavigate: (action: "first" | "prev" | "next" | "last") => void;
  onExportPGN: () => void;
  timeControl: number;
}

export function GameStatusPanel({
  game,
  turn,
  isGameOver,
  result,
  history,
  currentMoveIndex,
  whiteTime,
  blackTime,
  onNavigate,
  onExportPGN,
  timeControl
}: GameStatusPanelProps) {

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const statusText = isGameOver
    ? result
    : `${turn === 'w' ? 'White' : 'Black'} to move`;

  const statusColor = isGameOver
    ? "text-orange-500"
    : turn === 'w' ? "text-primary" : "text-foreground";

  return (
    <div className="flex flex-col gap-4 h-full">
      {/* Game Status & Timers */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-lg font-bold flex items-center gap-2">
            <Trophy className="h-5 w-5 text-accent" />
            Game Status
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className={cn("text-center font-bold text-xl mb-4", statusColor)}>
            {statusText}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className={cn(
              "p-3 rounded-lg border-2 text-center transition-colors",
              turn === 'w' ? "bg-white border-primary shadow-md" : "bg-muted/50 border-transparent"
            )}>
              <div className="text-sm text-muted-foreground font-semibold mb-1">White</div>
              <div className="text-2xl font-mono font-bold flex items-center justify-center gap-2">
                <Clock className="h-4 w-4" />
                {timeControl > 0 ? formatTime(whiteTime) : "∞"}
              </div>
            </div>

            <div className={cn(
              "p-3 rounded-lg border-2 text-center transition-colors",
              turn === 'b' ? "bg-slate-900 text-white border-primary shadow-md" : "bg-muted/50 border-transparent"
            )}>
              <div className="text-sm text-muted-foreground font-semibold mb-1">Black</div>
              <div className="text-2xl font-mono font-bold flex items-center justify-center gap-2">
                <Clock className="h-4 w-4" />
                {timeControl > 0 ? formatTime(blackTime) : "∞"}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Move History */}
      <Card className="flex-1 flex flex-col min-h-0">
        <CardHeader className="pb-2 flex flex-row items-center justify-between">
          <CardTitle className="text-lg font-bold">Move History</CardTitle>
          <Button variant="ghost" size="icon" onClick={onExportPGN} title="Export PGN">
            <Download className="h-4 w-4" />
          </Button>
        </CardHeader>
        <CardContent className="flex-1 min-h-0 p-0">
          <ScrollArea className="h-[300px] md:h-full w-full px-4">
            <div className="grid grid-cols-[3rem_1fr_1fr] gap-y-1 py-2 font-mono text-sm">
              {Array.from({ length: Math.ceil(history.length / 2) }).map((_, i) => (
                <div key={i} className="contents group">
                  <div className="text-muted-foreground py-1 border-b border-border/50">{i + 1}.</div>
                  <div className={cn(
                    "py-1 px-2 cursor-pointer border-b border-border/50 hover:bg-accent/20 transition-colors rounded",
                    (i * 2) === currentMoveIndex ? "bg-primary text-white font-bold" : ""
                  )}>
                    {history[i * 2]}
                  </div>
                  <div className={cn(
                    "py-1 px-2 cursor-pointer border-b border-border/50 hover:bg-accent/20 transition-colors rounded",
                    (i * 2 + 1) === currentMoveIndex ? "bg-primary text-white font-bold" : ""
                  )}>
                    {history[i * 2 + 1]}
                  </div>
                </div>
              ))}
              {history.length === 0 && (
                <div className="col-span-3 text-center text-muted-foreground py-8 italic">
                  No moves yet. Start playing!
                </div>
              )}
            </div>
          </ScrollArea>
        </CardContent>
        <div className="p-2 border-t bg-muted/20 flex gap-1">
          <Button variant="outline" className="flex-1" onClick={() => onNavigate("first")} disabled={history.length === 0}>
            <ChevronFirst className="h-4 w-4" />
          </Button>
          <Button variant="outline" className="flex-1" onClick={() => onNavigate("prev")} disabled={history.length === 0}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button variant="outline" className="flex-1" onClick={() => onNavigate("next")} disabled={history.length === 0}>
            <ChevronRight className="h-4 w-4" />
          </Button>
          <Button variant="outline" className="flex-1" onClick={() => onNavigate("last")} disabled={history.length === 0}>
            <ChevronLast className="h-4 w-4" />
          </Button>
        </div>
      </Card>
    </div>
  );
}
