import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useState } from "react";
import { Clock } from "lucide-react";
import { cn } from "@/lib/utils";

interface NewGameDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onStartGame: (settings: GameSettings) => void;
}

export interface GameSettings {
  mode: "engine" | "analysis";
  timeControl: number;
  playerColor: "white" | "black";
  level: number;
}

export function NewGameDialog({ open, onOpenChange, onStartGame }: NewGameDialogProps) {
  const [mode, setMode] = useState<"engine" | "analysis">("engine");
  const [timeControl, setTimeControl] = useState(0); // 0 = no limit
  const [color, setColor] = useState<"white" | "black">("white");
  const [level, setLevel] = useState(5);

  const handleStart = () => {
    onStartGame({
      mode,
      timeControl,
      playerColor: color,
      level
    });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Start New Game</DialogTitle>
        </DialogHeader>

        <div className="grid gap-6 py-4">
          <div className="space-y-2">
            <Label>Game Mode</Label>
            <Select value={mode} onValueChange={(v) => setMode(v as "engine" | "analysis")}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="engine">Play vs Engine</SelectItem>
                <SelectItem value="analysis">Analysis Mode</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Time Control</Label>
            <div className="grid grid-cols-4 gap-2">
              {[180, 300, 600, 0].map((t) => (
                <Button
                  key={t}
                  variant={timeControl === t ? "default" : "outline"}
                  className="w-full"
                  onClick={() => setTimeControl(t)}
                >
                  {t === 0 ? "∞" : `${t/60}m`}
                </Button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <Label>Play As</Label>
            <div className="grid grid-cols-2 gap-2">
              <Button
                variant={color === "white" ? "default" : "outline"}
                onClick={() => setColor("white")}
                className={cn(color === "white" ? "bg-white text-black hover:bg-white/90 border-2 border-primary" : "")}
              >
                White
              </Button>
              <Button
                variant={color === "black" ? "default" : "outline"}
                onClick={() => setColor("black")}
                className={cn(color === "black" ? "bg-black text-white hover:bg-black/90 border-2 border-primary" : "")}
              >
                Black
              </Button>
            </div>
          </div>

          {mode === "engine" && (
            <div className="space-y-2">
              <Label>Engine Level: {level}</Label>
              <Select value={String(level)} onValueChange={(v) => setLevel(parseInt(v))}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">Level 1 - Beginner</SelectItem>
                  <SelectItem value="5">Level 5 - Intermediate</SelectItem>
                  <SelectItem value="10">Level 10 - Expert</SelectItem>
                  <SelectItem value="20">Level 20 - Grandmaster</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}
        </div>

        <Button onClick={handleStart} className="w-full font-bold">Start Game</Button>
      </DialogContent>
    </Dialog>
  );
}
