export const COACHING_MESSAGES_VERSION = '1.0.0';

const rule = (principle, success, failure, focus, direction) => Object.freeze({ principle, success, failure, focus, direction });

export const ENDGAME_COACHING_MESSAGES = Object.freeze({
    opposition: rule('Keep the kings facing each other with an odd number of squares between them.', 'You preserved the opposition and kept control of the king route.', 'That move gives up the opposition. Keep the kings aligned before committing the pawn.', 'Use the king to control the entry squares.', 'Look for a king move that keeps the kings facing each other.'),
    'defensive-opposition': rule('Use opposition to deny the attacking king an entry square.', 'You kept the defensive opposition and restricted the attacking king.', 'The king stepped away from the opposition and weakened the defensive barrier.', 'Keep your king in front of the attacking king.', 'Choose a king move that preserves the barrier.'),
    'key-squares': rule('The king must reach a useful square ahead of or beside its pawn.', 'Your king improved its access to the pawn’s key squares.', 'That move does not improve access to the key squares around the pawn.', 'Coordinate the king with the pawn.', 'Improve the king before advancing the pawn.'),
    'king-activity': rule('Activate the king before making irreversible pawn moves.', 'You improved the king while keeping the pawn structure useful.', 'That move leaves the king too far from the critical play.', 'Bring the king toward the contested area.', 'Look for the king move that improves access.'),
    'promotion-technique': rule('Support the passed pawn before pushing it toward promotion.', 'You preserved the promotion plan and kept the pawn supported.', 'That move weakens the promotion plan or advances without enough support.', 'Coordinate the king with the advanced pawn.', 'Keep the pawn protected while improving the king.'),
    'stop-promotion': rule('Stay within reach of the promotion square and build a blockade.', 'You kept a practical route to stop the passed pawn.', 'That move abandons the defensive route to the promotion square.', 'Use the king to approach the promotion path.', 'Move toward the square where the pawn must promote.'),
    blockade: rule('Place a stable blocker in front of the passed pawn.', 'You maintained the blockade and denied immediate pawn progress.', 'That move loosens the blockade and gives the pawn more freedom.', 'Keep a piece in front of the pawn.', 'Strengthen the square directly ahead of the pawn.'),
    'pawn-breakthrough': rule('Create a passed pawn only when the pawn structure supports the race.', 'You preserved the breakthrough idea and useful pawn contact.', 'That move releases the pawn tension without creating useful progress.', 'Compare the pawn races before exchanging.', 'Look for the pawn move that creates a protected route forward.'),
    'rook-behind-pawn': rule('Rooks are usually most active behind passed pawns.', 'You kept the rook behind the passed pawn and preserved active support.', 'That move gives up the useful placement behind the passed pawn.', 'Improve the rook before moving the king.', 'Place or keep the rook behind the pawn.'),
    'king-cut-off': rule('Use the rook to restrict the defending king before advancing.', 'You maintained the king cut-off and limited defensive access.', 'That move releases the defending king from the rook’s barrier.', 'Keep the rook controlling a file or rank.', 'Restrict the king before pushing the pawn.'),
    'side-check-defense': rule('Create lateral checking distance before the attacking king finds shelter.', 'You preserved active side checks and practical defensive chances.', 'That move loses the checking distance needed for active defense.', 'Keep the rook far enough away to check safely.', 'Look for checks from the side rather than passive waiting.'),
    'lucena-like': rule('Build a bridge so the king can shelter from rook checks.', 'You preserved the bridge-building geometry and the promotion plan.', 'That move abandons the bridge setup before the king is sheltered.', 'Coordinate the rook with the advanced king and pawn.', 'Prepare rook cover before stepping away from the pawn.'),
    'philidor-like': rule('Hold the third-rank barrier until the pawn advances, then check from behind.', 'You preserved the active barrier and delayed the pawn’s advance.', 'That move abandons the defensive barrier too early.', 'Keep the rook active across the barrier rank.', 'Wait with the rook while the barrier remains stable.'),
    'passed-pawn': rule('Support the passed pawn and control its promotion route.', 'You kept the passed pawn coordinated with the king.', 'That move separates the pawn from the support it needs.', 'Coordinate the king and passed pawn.', 'Improve support before pushing farther.')
});

export const GENERAL_COACHING_MESSAGES = Object.freeze({
    principle: 'Preserve the position’s key setup before making an irreversible move.',
    success: 'Good move. You preserved the important features of the position.',
    failure: 'This move weakens the position. Preserve the critical setup before continuing.',
    criticalWinDraw: 'This move changed the position from winning to drawn. Preserve the winning setup before committing.',
    criticalWinLoss: 'This move changed the position from winning to lost. Recheck the opponent’s strongest reply.',
    criticalDrawLoss: 'This move loses the drawing resource. Keep the defensive setup intact.',
    alreadyLost: 'The position was already difficult. Look for the move that creates the most resistance.',
    focus: 'Compare the opponent’s strongest reply before moving.',
    direction: 'Look for a move that preserves king activity and piece coordination.'
});
