import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import {
  Settings,
  RefreshCw,
  FlipHorizontal,
  FileCode,
  Edit3
} from "lucide-react";
import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

interface EngineSettingsPanelProps {
  engineLevel: number;
  setEngineLevel: (level: number) => void;
  playerColor: "white" | "black";
  setPlayerColor: (color: "white" | "black") => void;
  onFlipBoard: () => void;
  onLoadFen: (fen: string) => void;
  onNewGame: () => void;
}

export function EngineSettingsPanel({
  engineLevel,
  setEngineLevel,
  playerColor,
  setPlayerColor,
  onFlipBoard,
  onLoadFen,
  onNewGame
}: EngineSettingsPanelProps) {
  const [fenInput, setFenInput] = useState("");
  const [fenOpen, setFenOpen] = useState(false);

  const handleFenSubmit = () => {
    if (fenInput) {
      onLoadFen(fenInput);
      setFenOpen(false);
      setFenInput("");
    }
  };

  return (
    <div className="flex flex-col gap-4">
      {/* Settings */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-lg font-bold flex items-center gap-2">
            <Settings className="h-5 w-5 text-accent" />
            Engine Settings
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <div className="flex justify-between">
              <Label>Engine Strength (1-20)</Label>
              <span className="text-sm font-bold text-primary">{engineLevel}</span>
            </div>
            <Slider
              value={[engineLevel]}
              onValueChange={(v) => setEngineLevel(v[0])}
              max={20}
              min={1}
              step={1}
              className="py-2"
            />
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>Beginner</span>
              <span>Grandmaster</span>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Play As</Label>
            <Select
              value={playerColor}
              onValueChange={(v) => setPlayerColor(v as "white" | "black")}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="white">White</SelectItem>
                <SelectItem value="black">Black</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Quick Actions */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-lg font-bold">Quick Actions</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <Button variant="outline" className="w-full justify-start gap-2" onClick={onFlipBoard}>
            <FlipHorizontal className="h-4 w-4" /> Flip Board
          </Button>

          <Dialog open={fenOpen} onOpenChange={setFenOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" className="w-full justify-start gap-2">
                <FileCode className="h-4 w-4" /> Paste FEN
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Load Position from FEN</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label>FEN String</Label>
                  <Input
                    placeholder="rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1"
                    value={fenInput}
                    onChange={(e) => setFenInput(e.target.value)}
                  />
                </div>
                <Button onClick={handleFenSubmit} className="w-full">Load Position</Button>
              </div>
            </DialogContent>
          </Dialog>

          <Button variant="default" className="w-full justify-start gap-2" onClick={onNewGame}>
            <RefreshCw className="h-4 w-4" /> New Game
          </Button>
        </CardContent>
      </Card>

      {/* Credits */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-bold text-muted-foreground uppercase">Credits</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          <p className="mb-1"><strong>Design:</strong> TVLAVIN</p>
          <p className="mb-1"><strong>Engine:</strong> Stockfish 16 NNUE</p>
          <p><strong>Libraries:</strong> chess.js, react-chessboard</p>
        </CardContent>
      </Card>
    </div>
  );
}
