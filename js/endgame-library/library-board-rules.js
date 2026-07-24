import { ChessRulesFacade } from '../endgame-trainer/chess-rules-facade.js';

export function createLibraryBoardRules(fen) {
  return fen ? ChessRulesFacade.fromFen(fen) : new ChessRulesFacade();
}
