import { Chess } from '../../assets/vendor/chess.js/chess-1.4.0.esm.js';
import { create as createBoardAdapter } from '../board/caissa-board-adapter.js';
import { createExplorerClient } from '../mentor/mentor-explorer.js';
import { SavedRepertoireStore } from './repertoire-store.js';
import { TrainingSession } from './training-session.js';
import { buildOpeningIndex, parseCatalogMoves } from './opening-index.js';
import { WikiBookClient } from './wikibook-client.js';
import { OpeningGamesClient } from './games-client.js';
import { AnalysisDraftStore } from './analysis-draft-store.js';
import { buildPairedTreeRows } from './analysis-tree-rows.js';

const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
const ENGINE_DISPLAY_NAME = 'Stockfish 19 Lite';
const constrainedEngineDevice = () => {
    const memory = Number(navigator.deviceMemory) || 0;
    const cores = Number(navigator.hardwareConcurrency) || 0;
    return (memory > 0 && memory <= 4)
        || (cores > 0 && cores <= 4)
        || window.matchMedia?.('(max-width: 700px), (pointer: coarse)')?.matches === true;
};
const ENGINE_TARGET_DEPTH = constrainedEngineDevice() ? 18 : 20;
const ENGINE_MULTIPV = constrainedEngineDevice() ? 2 : 3;
const TREE_API = window.CaissaAnalyzeVariationTree;
if (!TREE_API?.create) throw new Error('CAISSA Analysis Tree is unavailable.');
const readEnginePreference = () => {
    try { return sessionStorage.getItem('caissa.opening-trainer.engine-enabled') !== 'false'; }
    catch { return true; }
};

const byId = id => document.getElementById(id);
const els = {
    board: byId('openingTrainerBoard'),
    openingIdentity: byId('trainerOpeningIdentity'),
    boardMode: byId('trainerBoardMode'),
    boardTurn: byId('trainerBoardTurn'),
    variationTree: byId('trainerVariationTree'),
    treeCount: byId('trainerTreeCount'),
    analysisTitle: byId('trainerAnalysisTitle'),
    analysisEmpty: byId('trainerAnalysisEmpty'),
    repertoireColor: byId('trainerRepertoireColor'),
    save: byId('trainerSaveButton'),
    saveTrain: byId('trainerSaveTrainButton'),
    repertoireSelect: byId('trainerRepertoireSelect'),
    lineSelect: byId('trainerLineSelect'),
    practicePlayWhite: byId('trainerPracticePlayWhite'),
    practicePlayBlack: byId('trainerPracticePlayBlack'),
    startPractice: byId('trainerStartPractice'),
    retryPractice: byId('trainerRetryPractice'),
    hint: byId('trainerHintButton'),
    practiceCard: byId('trainerPracticeCard'),
    practiceEmpty: byId('trainerPracticeEmpty'),
    practicePrompt: byId('trainerPracticePrompt'),
    practiceProgress: byId('trainerPracticeProgress'),
    practiceProgressBar: byId('trainerPracticeProgressBar'),
    practiceFeedback: byId('trainerPracticeFeedback'),
    practiceAccuracy: byId('trainerPracticeAccuracy'),
    practiceErrors: byId('trainerPracticeErrors'),
    practiceHints: byId('trainerPracticeHints'),
    practiceReveals: byId('trainerPracticeReveals'),
    sessionLock: byId('trainerSessionLock'),
    reveal: byId('trainerRevealButton'),
    nextLine: byId('trainerNextLine'),
    gamesStatus: byId('trainerGamesStatus'),
    gamesList: byId('trainerGamesList'),
    gamesSearchForm: byId('trainerGamesSearchForm'),
    gamesQuery: byId('trainerGamesQuery'),
    searchGames: byId('trainerSearchGames'),
    gamesPagination: byId('trainerGamesPagination'),
    gamesPreviousPage: byId('trainerGamesPreviousPage'),
    gamesNextPage: byId('trainerGamesNextPage'),
    gamesPageStatus: byId('trainerGamesPageStatus'),
    gameNotationTitle: byId('trainerGameNotationTitle'),
    gameNotationStatus: byId('trainerGameNotationStatus'),
    gameNotation: byId('trainerGameNotation'),
    ecoSearch: byId('trainerEcoSearch'),
    ecoResults: byId('trainerEcoResults'),
    explorerStatus: byId('trainerExplorerStatus'),
    explorerMoves: byId('trainerExplorerMoves'),
    wikiAuto: byId('trainerWikiAuto'),
    wikiLock: byId('trainerWikiLock'),
    wikiTitle: byId('trainerWikiTitle'),
    wikiMatch: byId('trainerWikiMatch'),
    wikiContent: byId('trainerWikiContent'),
    wikiAttribution: byId('trainerWikiAttribution'),
    wikiSource: byId('trainerWikiSource'),
    wikiReturn: byId('trainerWikiReturn'),
    engineStrip: byId('trainerEngineStrip'),
    engineStripToggle: byId('trainerEngineStripToggle'),
    engineEval: byId('trainerEngineEval'),
    engineDepth: byId('trainerEngineDepth'),
    enginePv: byId('trainerEnginePv'),
    engineLines: byId('trainerEngineLines'),
    evalRailFill: byId('trainerEvalRailFill'),
    evalRailScore: byId('trainerEvalRailScore'),
    newStudy: byId('trainerNewStudy'),
    flip: byId('trainerFlipBoard'),
    engineToggle: byId('trainerEngineToggle'),
    first: byId('trainerFirstMove'),
    previous: byId('trainerPreviousMove'),
    next: byId('trainerNextMove'),
    last: byId('trainerLastMove'),
    toast: byId('trainerToast'),
    saveTrainDialog: byId('trainerSaveTrainDialog'),
    saveTrainSummary: byId('trainerSaveTrainSummary'),
    dialogPlayWhite: byId('trainerDialogPlayWhite'),
    dialogPlayBlack: byId('trainerDialogPlayBlack'),
    confirmPractice: byId('trainerConfirmPractice'),
    newStudyDialog: byId('trainerNewStudyDialog'),
    saveReason: byId('trainerSaveReason')
};

const repertoireStore = new SavedRepertoireStore();
const analysisDraftStore = new AnalysisDraftStore();
const wikiClient = new WikiBookClient();
const gamesClient = new OpeningGamesClient();
const explorerClient = createExplorerClient({
    fetchFn: async (url, options) => {
        const response = await fetch(url, options);
        if (response.ok || !String(url).startsWith('/openingdb/')) return response;
        return fetch(`https://downloads.caissa-chess.org${url}`, options);
    }
});

let tree = TREE_API.create({ initialFen: START_FEN, selectedPly: 0 });
let analysisGame = new Chess();
let board = null;
let openingIndex = null;
let ecoRows = [];
let openingRows = [];
let activeOpening = null;
let activeTab = 'analysis';
let selectedSquare = null;
let selectedLineNodes = new Set();
let trainingSession = null;
let trainingRecorded = false;
let trainingLineIndex = 0;
let analysisOrientation = 'white';
let engine = null;
let engineEnabled = readEnginePreference();
let engineReady = false;
let engineWorkspaceGeneration = -1;
let engineLines = new Map();
let lastEngineInfo = null;
let engineIdentity = null;
let activeEngineFen = '';
let wikiAbort = null;
let wikiLocked = false;
let gamesAbort = null;
let gameLoadAbort = null;
let gamesLoadedKey = '';
let gamesSearchPage = 1;
let gamesSearchQuery = '';
let selectedGame = null;
let selectedGamePly = 0;
let pendingPracticeRepertoireId = '';
let toastTimer = null;
let workspaceGeneration = 0;
let lastSavedStudyFingerprint = '';
let repertoireIdentity = null;
let unsubscribeAuth = null;
let runtimeInitialized = false;

function toast(message) {
    els.toast.textContent = message;
    els.toast.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { els.toast.hidden = true; }, 3400);
}

function currentAnalysisMoves() {
    return tree.getActiveLine().map(node => ({
        id: node.id,
        uci: node.uci,
        san: node.san,
        from: node.move?.from || node.uci.slice(0, 2),
        to: node.move?.to || node.uci.slice(2, 4),
        promotion: node.move?.promotion || node.uci.slice(4, 5) || null,
        color: node.color,
        fenBefore: node.fenBefore,
        fenAfter: node.fen
    }));
}

function currentVisibleGame() {
    if (activeTab === 'practice' && trainingSession) return new Chess(trainingSession.fen);
    if (activeTab === 'games' && selectedGame) return new Chess(selectedGameFen());
    return new Chess(tree.getCurrentNode().fen || START_FEN);
}

function selectedGameFen() {
    if (!selectedGame || selectedGamePly <= 0) return START_FEN;
    return selectedGame.moves[selectedGamePly - 1]?.fenAfter || START_FEN;
}

function boardPosition() {
    if (activeTab === 'practice' && trainingSession) return trainingSession.fen;
    if (activeTab === 'games' && selectedGame) return selectedGameFen();
    return tree.getCurrentNode().fen || START_FEN;
}

function enginePositionFen() {
    const fen = boardPosition();
    let lastMove = null;
    if (activeTab === 'games' && selectedGame && selectedGamePly > 0) {
        lastMove = selectedGame.moves[selectedGamePly - 1];
    } else if (activeTab !== 'practice') {
        lastMove = tree.getCurrentNode()?.move || null;
    }
    const from = String(lastMove?.from || '');
    const to = String(lastMove?.to || '');
    let isPawn = false;
    try { isPawn = new Chess(lastMove?.fenBefore || START_FEN).get(from)?.type === 'p'; } catch { isPawn = false; }
    const isWhiteDoublePush = isPawn && from[1] === '2' && to[1] === '4' && from[0] === to[0];
    const isBlackDoublePush = isPawn && from[1] === '7' && to[1] === '5' && from[0] === to[0];
    if (!isWhiteDoublePush && !isBlackDoublePush) return fen;
    const parts = fen.split(/\s+/);
    if (parts.length < 6) return fen;
    parts[3] = `${from[0]}${isWhiteDoublePush ? '3' : '6'}`;
    return parts.join(' ');
}

function setBoardPosition(fen, { lastMove = null } = {}) {
    board.setPosition(fen, { animate: false, coalesce: true });
    board.clearArrows();
    selectedSquare = null;
    board.replaceOverlays({
        selection: null,
        highlights: lastMove ? [
            { square: lastMove.from, type: 'last' },
            { square: lastMove.to, type: 'last' }
        ] : []
    });
    updateBoardCaption();
}

function updateBoardCaption() {
    const game = currentVisibleGame();
    els.boardTurn.textContent = `${game.turn() === 'w' ? 'White' : 'Black'} to move`;
    if (activeTab === 'practice' && trainingSession) {
        els.boardMode.innerHTML = '<i class="fas fa-lock" aria-hidden="true"></i> Protected practice session';
    } else if (activeTab === 'games' && selectedGame) {
        els.boardMode.innerHTML = '<i class="fas fa-book-open" aria-hidden="true"></i> Selected game review';
    } else {
        els.boardMode.innerHTML = '<i class="fas fa-diagram-project" aria-hidden="true"></i> Analysis board';
    }
}

function legalDestinations(game, square) {
    try {
        return game.moves({ square, verbose: true }).map(move => move.to);
    } catch {
        return [];
    }
}

function selectBoardSquare(square) {
    if (activeTab === 'games' && selectedGame) {
        toast('Use the footer controls to navigate the selected game.');
        return;
    }
    const game = currentVisibleGame();
    const piece = game.get(square);
    if (activeTab === 'practice' && trainingSession
        && (trainingSession.completed || game.turn() !== trainingSession.userColor)) return;
    if (!selectedSquare) {
        if (!piece || piece.color !== game.turn()) return;
        selectedSquare = square;
        board.replaceOverlays({
            selection: square,
            highlights: legalDestinations(game, square).map(target => ({ square: target, type: 'legal' }))
        });
        return;
    }
    if (selectedSquare === square) {
        selectedSquare = null;
        board.clearHighlights();
        return;
    }
    const from = selectedSquare;
    const nextPiece = game.get(square);
    if (nextPiece?.color === game.turn()) {
        selectedSquare = square;
        board.replaceOverlays({
            selection: square,
            highlights: legalDestinations(game, square).map(target => ({ square: target, type: 'legal' }))
        });
        return;
    }
    selectedSquare = null;
    handleMoveAttempt({ from, to: square, promotion: 'q', inputMethod: 'tap' });
}

function canDrag(square) {
    if (activeTab === 'games' && selectedGame) return false;
    const game = currentVisibleGame();
    const piece = game.get(square);
    if (activeTab === 'practice' && trainingSession) {
        return Boolean(!trainingSession.completed
            && game.turn() === trainingSession.userColor
            && piece?.color === trainingSession.userColor);
    }
    return Boolean(piece && piece.color === game.turn());
}

function handleMoveAttempt(payload) {
    const game = currentVisibleGame();
    const piece = game.get(payload.from);
    const isPromotion = piece?.type === 'p' && /^[a-h][18]$/.test(payload.to);
    const promotion = isPromotion ? String(payload.promotion || 'q').toLowerCase() : '';
    const uci = `${payload.from}${payload.to}${promotion}`;
    if (activeTab === 'practice' && trainingSession) handlePracticeAttempt(uci);
    else if (activeTab === 'games' && selectedGame) toast('Use the footer controls to navigate the selected game.');
    else applyAnalysisMove(uci);
}

function applyAnalysisMove(uci) {
    const parent = tree.getCurrentNode();
    const game = new Chess(parent.fen || START_FEN);
    let move = null;
    try {
        move = game.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] || 'q' });
    } catch {
        move = null;
    }
    if (!move) {
        setBoardPosition(parent.fen || START_FEN);
        toast('That move is not legal in this position.');
        return false;
    }
    const inserted = tree.insertOrSelectMove({
        from: move.from,
        to: move.to,
        promotion: move.promotion,
        san: move.san,
        uci: `${move.from}${move.to}${move.promotion || ''}`,
        color: move.color,
        fenBefore: parent.fen || START_FEN,
        fen: game.fen()
    });
    if (!inserted.ok) return false;
    analysisGame = game;
    selectedLineNodes.delete(parent.id);
    selectedLineNodes.add(inserted.node.id);
    setBoardPosition(game.fen(), { lastMove: move });
    afterAnalysisPositionChanged();
    return true;
}

function treeLineTo(nodeId) {
    const snapshot = tree.inspect();
    const byNode = new Map(snapshot.nodes.map(node => [node.id, node]));
    const result = [];
    let node = byNode.get(nodeId);
    while (node && node.id !== 'root') {
        result.push({
            uci: node.uci,
            san: node.san,
            from: node.move?.from || node.uci.slice(0, 2),
            to: node.move?.to || node.uci.slice(2, 4),
            promotion: node.move?.promotion || node.uci.slice(4, 5) || null,
            color: node.color,
            fenBefore: node.fenBefore,
            fenAfter: node.fen
        });
        node = byNode.get(node.parentId);
    }
    return result.reverse();
}

function collectSelectedLines() {
    const snapshot = tree.inspect();
    const validIds = new Set(snapshot.nodes.filter(node => node.id !== 'root').map(node => node.id));
    const selected = [...selectedLineNodes].filter(id => validIds.has(id));
    if (!selected.length && snapshot.currentNodeId !== 'root') selected.push(snapshot.currentNodeId);
    return selected.map(treeLineTo).filter(line => line.length);
}

function studyFingerprint() {
    const snapshot = tree.inspect();
    return JSON.stringify({
        color: els.repertoireColor.value,
        currentNodeId: snapshot.currentNodeId,
        selected: [...selectedLineNodes].sort(),
        nodes: snapshot.nodes.map(node => ({ id: node.id, parentId: node.parentId, uci: node.uci || '' }))
    });
}

function hasUnsavedStudyChanges() {
    return tree.inspect().nodes.length > 1 && studyFingerprint() !== lastSavedStudyFingerprint;
}

function updateSaveControls() {
    const lines = collectSelectedLines();
    const enabled = repertoireStore.isReady && lines.length > 0;
    els.save.disabled = !enabled;
    els.saveTrain.disabled = !enabled;
    const reason = !repertoireStore.isReady
        ? 'Loading your session workspace…'
        : enabled
        ? `Saved for this session · ${lines.length} selected ${lines.length === 1 ? 'variation' : 'variations'} ready · ${els.repertoireColor.value === 'black' ? 'Black' : 'White'}.`
        : 'Saved for this session only · Play or load a legal opening line to enable Save.';
    els.saveReason.textContent = reason;
    els.save.title = enabled ? 'Save the selected analysis variations' : reason;
    els.saveTrain.title = enabled ? 'Save the selected variations and open Practice' : reason;
}

function saveRepertoire({ train = false } = {}) {
    try {
        if (!repertoireStore.isReady) throw new Error('Your repertoire workspace is still loading.');
        const lines = collectSelectedLines();
        const saved = repertoireStore.save({
            name: `${activeOpening?.name || 'Custom opening'} · ${els.repertoireColor.value === 'black' ? 'Black' : 'White'}`,
            color: els.repertoireColor.value,
            eco: activeOpening?.eco || '',
            opening: activeOpening?.name || 'Custom opening',
            initialFen: START_FEN,
            lines
        });
        lastSavedStudyFingerprint = studyFingerprint();
        captureAnalysisDraft(repertoireIdentity);
        updateSaveControls();
        renderRepertoireOptions(saved.id);
        toast(`Saved for this session: ${saved.lines.length} ${saved.lines.length === 1 ? 'line' : 'lines'} in ${saved.name}.`);
        if (train) {
            pendingPracticeRepertoireId = saved.id;
            els.saveTrainSummary.textContent = `${saved.name} contains ${saved.lines.length} ${saved.lines.length === 1 ? 'variation' : 'variations'}.`;
            setDialogPracticeColor(saved.color);
            if (typeof els.saveTrainDialog.showModal === 'function') els.saveTrainDialog.showModal();
            else {
                setPracticeColor(saved.color);
                setTab('practice');
                startPractice(saved.id, 0, { userColor: saved.color });
            }
        }
        return saved;
    } catch (error) {
        toast(error.message || 'The repertoire could not be saved.');
        return null;
    }
}

function renderTree() {
    const snapshot = tree.inspect();
    const nodes = new Map(snapshot.nodes.map(node => [node.id, node]));
    const pairedRows = buildPairedTreeRows(snapshot);
    els.variationTree.replaceChildren();

    const header = document.createElement('div');
    header.className = 'opening-trainer-tree-head';
    header.setAttribute('role', 'row');
    ['Move', 'White', 'Black', 'Line'].forEach(label => {
        const cell = document.createElement('span');
        cell.setAttribute('role', 'columnheader');
        cell.textContent = label;
        header.append(cell);
    });
    els.variationTree.append(header);

    const selectNode = node => {
        tree.selectNode(node.id, { preferMainContinuation: false });
        analysisGame = new Chess(node.fen || START_FEN);
        if (activeTab !== 'practice') setBoardPosition(node.fen || START_FEN);
        afterAnalysisPositionChanged({ keepWikiArticle: wikiLocked });
    };

    const moveCell = (nodeId, side) => {
        const cell = document.createElement('div');
        cell.setAttribute('role', 'gridcell');
        const node = nodeId ? nodes.get(nodeId) : null;
        if (!node) {
            const empty = document.createElement('span');
            empty.className = 'opening-trainer-tree-empty-move';
            empty.setAttribute('aria-hidden', 'true');
            cell.append(empty);
            return cell;
        }
        const button = document.createElement('button');
        button.type = 'button';
        button.className = `opening-trainer-tree-move${node.id === snapshot.currentNodeId ? ' is-current' : ''}`;
        button.dataset.nodeId = node.id;
        button.textContent = node.san;
        button.setAttribute('aria-label', `${side} move ${node.moveNumber}: ${node.san}`);
        if (node.id === snapshot.currentNodeId) button.setAttribute('aria-current', 'step');
        button.addEventListener('click', () => selectNode(node));
        cell.append(button);
        return cell;
    };

    pairedRows.forEach(paired => {
        const white = paired.whiteId ? nodes.get(paired.whiteId) : null;
        const endpoint = nodes.get(paired.selectionNodeId);
        const containsCurrent = paired.whiteId === snapshot.currentNodeId || paired.blackId === snapshot.currentNodeId;
        const row = document.createElement('div');
        row.className = `opening-trainer-tree-row${paired.variation ? ' is-variation' : ''}${containsCurrent ? ' has-current' : ''}`;
        row.setAttribute('role', 'row');
        row.setAttribute('aria-level', String(paired.depth + 1));
        row.dataset.rowId = paired.id;
        row.style.marginLeft = `${Math.min(paired.depth, 6) * 12}px`;

        const number = document.createElement('span');
        number.className = 'opening-trainer-tree-number';
        number.setAttribute('role', 'rowheader');
        const marker = document.createElement('span');
        marker.className = 'opening-trainer-tree-branch';
        marker.textContent = paired.variation ? '↳' : '';
        marker.setAttribute('aria-hidden', 'true');
        number.append(marker, document.createTextNode(`${paired.moveNumber}${white ? '.' : '…'}`));
        row.append(number, moveCell(paired.whiteId, 'White'), moveCell(paired.blackId, 'Black'));

        const lineCell = document.createElement('div');
        lineCell.setAttribute('role', 'gridcell');
        const include = document.createElement('label');
        include.className = 'opening-trainer-tree-line-choice';
        include.title = `Include the complete line ending after ${endpoint?.san || 'this move'}`;
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.checked = selectedLineNodes.has(paired.selectionNodeId);
        checkbox.setAttribute('aria-label', `Include complete line through ${endpoint?.san || 'this move'}`);
        checkbox.addEventListener('change', () => {
            if (checkbox.checked) selectedLineNodes.add(paired.selectionNodeId);
            else selectedLineNodes.delete(paired.selectionNodeId);
            captureAnalysisDraft(repertoireIdentity);
            updateSaveControls();
        });
        include.append(checkbox);
        lineCell.append(include);
        row.append(lineCell);
        els.variationTree.append(row);
    });
    const moveCount = snapshot.nodes.length - 1;
    els.treeCount.textContent = `${moveCount} ${moveCount === 1 ? 'ply' : 'plies'} · ${pairedRows.length} ${pairedRows.length === 1 ? 'row' : 'rows'}`;
    els.analysisEmpty.hidden = moveCount > 0;
    els.variationTree.hidden = moveCount === 0;
    updateNavigationControls();
    updateSaveControls();
}

function updateNavigationControls() {
    if (activeTab === 'practice') {
        [els.first, els.previous, els.next, els.last].forEach(button => { button.disabled = true; });
        return;
    }
    if (activeTab === 'games' && selectedGame) {
        const atStart = selectedGamePly <= 0;
        const atEnd = selectedGamePly >= selectedGame.moves.length;
        els.first.disabled = atStart;
        els.previous.disabled = atStart;
        els.next.disabled = atEnd;
        els.last.disabled = atEnd;
        return;
    }
    const snapshot = tree.inspect();
    els.first.disabled = snapshot.currentNodeId === 'root';
    els.previous.disabled = snapshot.currentNodeId === 'root';
    els.next.disabled = !tree.getCurrentNode().childrenIds.length;
    els.last.disabled = snapshot.currentNodeId === 'root';
}

function practiceColor() {
    return els.practicePlayBlack.checked ? 'black' : 'white';
}

function dialogPracticeColor() {
    return els.dialogPlayBlack.checked ? 'black' : 'white';
}

function setPracticeColor(color) {
    const black = color === 'black' || color === 'b';
    els.practicePlayWhite.checked = !black;
    els.practicePlayBlack.checked = black;
}

function setDialogPracticeColor(color) {
    const black = color === 'black' || color === 'b';
    els.dialogPlayWhite.checked = !black;
    els.dialogPlayBlack.checked = black;
}

function renderRepertoireOptions(preferredId = '') {
    const repertoires = repertoireStore.list();
    const previous = preferredId || els.repertoireSelect.value;
    els.repertoireSelect.replaceChildren();
    if (!repertoireStore.isReady) {
        els.repertoireSelect.add(new Option('Loading session repertoires…', ''));
        els.startPractice.disabled = true;
        renderLineOptions();
        return;
    }
    if (!repertoires.length) {
        els.repertoireSelect.add(new Option('No session repertoires', ''));
        els.startPractice.disabled = true;
        if (!trainingSession) setPracticeColor('white');
        renderLineOptions();
        return;
    }
    for (const repertoire of repertoires) {
        const accuracy = repertoire.progress?.attempts
            ? Math.round((repertoire.progress.correct / repertoire.progress.attempts) * 100)
            : 100;
        els.repertoireSelect.add(new Option(`${repertoire.name} · ${accuracy}%`, repertoire.id));
    }
    if (repertoires.some(item => item.id === previous)) els.repertoireSelect.value = previous;
    els.startPractice.disabled = false;
    renderLineOptions();
}

function renderLineOptions() {
    const repertoire = repertoireStore.get(els.repertoireSelect.value);
    els.lineSelect.replaceChildren();
    const count = repertoire?.lines?.length || 1;
    for (let index = 0; index < count; index += 1) {
        const plies = repertoire?.lines?.[index]?.length || 0;
        els.lineSelect.add(new Option(`Line ${index + 1}${plies ? ` · ${plies} plies` : ''}`, String(index)));
    }
    if (!trainingSession || trainingSession.snapshot.id !== repertoire?.id) {
        setPracticeColor(repertoire?.color || 'white');
    }
}

function startPractice(repertoireId = els.repertoireSelect.value, lineIndex = Number(els.lineSelect.value) || 0, { userColor = practiceColor() } = {}) {
    const repertoire = repertoireStore.get(repertoireId);
    if (!repertoire) {
        toast('Choose a saved repertoire first.');
        return;
    }
    trainingSession = new TrainingSession(repertoire, { lineIndex, userColor });
    trainingLineIndex = Math.max(0, Math.min(lineIndex, repertoire.lines.length - 1));
    trainingRecorded = false;
    els.repertoireSelect.value = repertoire.id;
    renderLineOptions();
    els.lineSelect.value = String(trainingLineIndex);
    setPracticeColor(trainingSession.userColor);
    els.practiceCard.hidden = false;
    els.practiceEmpty.hidden = true;
    els.sessionLock.hidden = false;
    board.setOrientation(trainingSession.userColor === 'b' ? 'black' : 'white');
    const caissaMoves = trainingSession.advanceCaissa();
    setBoardPosition(trainingSession.fen, { lastMove: caissaMoves.at(-1) || null });
    renderPractice('Remember your repertoire move.');
}

function renderPractice(message = '') {
    if (!trainingSession) return;
    const state = trainingSession.state();
    const ownMoves = trainingSession.snapshot.lines[trainingLineIndex]
        ?.filter(move => move.color === state.userColor).length || 0;
    const ownCompleted = Math.min(ownMoves, state.stats.correct);
    els.practicePrompt.textContent = state.completed ? 'Line complete' : `${state.userColor === 'w' ? 'White' : 'Black'} to recall`;
    els.practiceProgress.textContent = `${state.cursor} / ${state.totalPlies}`;
    els.practiceProgressBar.style.width = `${state.totalPlies ? (state.cursor / state.totalPlies) * 100 : 0}%`;
    els.practiceAccuracy.textContent = `${state.stats.accuracy}%`;
    els.practiceErrors.textContent = String(state.stats.errors);
    els.practiceHints.textContent = String(state.stats.hints);
    els.practiceReveals.textContent = String(state.stats.reveals);
    els.practiceFeedback.textContent = message || (state.completed
        ? `Completed ${ownCompleted} of ${ownMoves} repertoire moves.`
        : 'Your move.');
    els.practiceFeedback.dataset.tone = state.completed ? 'good' : '';
    els.hint.disabled = state.completed;
    els.reveal.disabled = state.completed;
    els.nextLine.disabled = !trainingSession.snapshot.lines.length;
    if (state.completed && !trainingRecorded) {
        repertoireStore.recordSession(state.repertoireId, trainingSession.result());
        trainingRecorded = true;
        renderRepertoireOptions(state.repertoireId);
    }
}

function handlePracticeAttempt(uci) {
    const result = trainingSession.attempt(uci);
    if (!result.ok) {
        board.clearHighlights();
        setBoardPosition(trainingSession.fen);
        const evaluation = lastEngineInfo ? ` Last analysis: ${els.engineEval.textContent}.` : '';
        els.practiceFeedback.dataset.tone = 'error';
        renderPractice(`${result.assessment || 'Try again.'}${evaluation}`);
        els.practiceFeedback.dataset.tone = 'error';
        return;
    }
    setBoardPosition(trainingSession.fen, { lastMove: result.move });
    renderPractice(result.status === 'complete' ? 'Excellent — line complete.' : 'Correct. CAISSA is replying…');
    els.practiceFeedback.dataset.tone = 'good';
    if (!trainingSession.completed) {
        const session = trainingSession;
        window.setTimeout(() => {
            if (trainingSession !== session) return;
            const moves = session.advanceCaissa();
            if (activeTab === 'practice') setBoardPosition(session.fen, { lastMove: moves.at(-1) || null });
            renderPractice(session.completed ? 'Line complete.' : 'Your move.');
        }, 260);
    }
}

function requestHint() {
    const hint = trainingSession?.hint();
    if (!hint) return;
    board.clearArrows();
    board.drawArrow(hint.from, hint.to, { color: '#ffc857', opacity: 0.9 });
    board.highlightSquares([{ square: hint.from, type: 'hint' }, { square: hint.to, type: 'hint' }]);
    renderPractice(`Hint: find ${hint.san}.`);
}

function revealPracticeMove() {
    const revealed = trainingSession?.reveal();
    if (!revealed) return;
    setBoardPosition(trainingSession.fen, { lastMove: revealed });
    renderPractice(`Revealed: ${revealed.san}. This attempt counts as an error.`);
    els.practiceFeedback.dataset.tone = 'error';
    if (!trainingSession.completed) {
        const session = trainingSession;
        window.setTimeout(() => {
            if (trainingSession !== session) return;
            const moves = session.advanceCaissa();
            if (activeTab === 'practice') setBoardPosition(session.fen, { lastMove: moves.at(-1) || null });
            renderPractice(session.completed ? 'Line complete.' : 'Your move.');
        }, 320);
    }
}

function startNextPracticeLine() {
    const repertoire = repertoireStore.get(trainingSession?.snapshot.id || els.repertoireSelect.value);
    if (!repertoire?.lines?.length) return;
    const nextIndex = (trainingLineIndex + 1) % repertoire.lines.length;
    startPractice(repertoire.id, nextIndex, { userColor: trainingSession?.userColor || practiceColor() });
    renderPractice(repertoire.lines.length > 1
        ? `Variation ${nextIndex + 1} of ${repertoire.lines.length}.`
        : 'Repeating this line for reinforcement.');
}

function formatScore(info, fen = boardPosition()) {
    if (!info) return { text: '—', pawns: 0 };
    const bound = info.scoreBound === 'lower' ? '≥' : (info.scoreBound === 'upper' ? '≤' : '');
    if (Number.isFinite(info.whiteMate)) {
        return { text: `${bound}M${info.whiteMate}`, pawns: info.whiteMate > 0 ? 12 : -12 };
    }
    if (Number.isFinite(info.whiteScorePawns)) {
        const pawns = info.whiteScorePawns;
        return { text: `${bound}${pawns >= 0 ? '+' : ''}${pawns.toFixed(2)}`, pawns };
    }
    if (info.score == null) return { text: '—', pawns: 0 };
    const turn = String(fen).split(/\s+/)[1] || 'w';
    const perspective = turn === 'w' ? 1 : -1;
    if (info.scoreType === 'mate') {
        const mate = info.score * perspective;
        return { text: `M${mate}`, pawns: mate > 0 ? 12 : -12 };
    }
    const pawns = (info.score * perspective) / 100;
    return { text: `${pawns >= 0 ? '+' : ''}${pawns.toFixed(2)}`, pawns };
}

function pvToSan(pv, fen) {
    const game = new Chess(fen);
    const san = [];
    for (const uci of pv.slice(0, 10)) {
        let move = null;
        try { move = game.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] || 'q' }); } catch { move = null; }
        if (!move) break;
        san.push(move.san);
    }
    return san.join(' ');
}

function renderEngineInfo(info) {
    if (!info || !engineEnabled || activeTab === 'practice' || engineWorkspaceGeneration !== workspaceGeneration) return;
    const activeFen = activeEngineFen || enginePositionFen();
    if (info.fen && info.fen !== activeEngineFen) return;
    const variation = info.multipv || 1;
    const previous = engineLines.get(variation);
    if (previous && previous.depth > info.depth) return;
    engineLines.set(variation, info);
    const score = formatScore(info, activeFen);
    const pvSan = pvToSan(info.pv || [], activeFen);
    if (variation === 1) {
        lastEngineInfo = info;
        els.engineEval.textContent = score.text;
        els.engineDepth.textContent = `Depth ${info.depth || 0}`;
        els.enginePv.textContent = pvSan || 'Calculating…';
        els.evalRailScore.textContent = score.text;
        const percentage = Math.max(6, Math.min(94, 50 + score.pawns * 4));
        els.evalRailFill.style.height = `${percentage}%`;
        board.clearArrows();
        const best = info.pv?.[0];
        if (best) board.drawArrow(best.slice(0, 2), best.slice(2, 4), { color: '#3c9dff', opacity: 0.78 });
    }
    els.engineLines.replaceChildren();
    [...engineLines.values()].sort((a, b) => a.multipv - b.multipv).forEach(line => {
        const item = document.createElement('li');
        item.textContent = `${formatScore(line, activeFen).text} · ${pvToSan(line.pv || [], activeFen) || 'Calculating…'}`;
        els.engineLines.append(item);
    });
}

function resetEnginePresentation({ practice = false, off = false } = {}) {
    engineLines.clear();
    lastEngineInfo = null;
    activeEngineFen = '';
    board?.clearArrows();
    els.engineEval.textContent = '—';
    els.engineDepth.textContent = practice ? 'Paused' : (off ? 'Off' : 'Depth 0');
    els.enginePv.textContent = practice ? 'Paused during protected practice' : (off ? 'Engine off' : 'Waiting for analysis…');
    els.engineLines.innerHTML = `<li>${practice ? 'Analysis is hidden during protected practice.' : (off ? 'Engine off.' : 'Waiting for Stockfish 19 Lite…')}</li>`;
    els.evalRailFill.style.height = '50%';
    els.evalRailScore.textContent = '—';
    if (practice) els.engineStrip.dataset.engineState = 'paused';
    else if (off) els.engineStrip.dataset.engineState = 'off';
}

async function initEngine() {
    const generation = workspaceGeneration;
    els.engineToggle.setAttribute('aria-pressed', String(engineEnabled));
    els.engineStripToggle.setAttribute('aria-pressed', String(engineEnabled));
    if (!engineEnabled) {
        resetEnginePresentation({ off: true });
        return;
    }
    if (!window.OpeningTrainerStockfishClient) {
        els.engineStrip.dataset.engineState = 'error';
        els.enginePv.textContent = 'Engine unavailable';
        return;
    }
    const candidate = new window.OpeningTrainerStockfishClient();
    engine = candidate;
    candidate.onInfo(info => {
        if (generation === workspaceGeneration && engine === candidate) renderEngineInfo(info);
    });
    candidate.onError(error => {
        if (generation !== workspaceGeneration || engine !== candidate) return;
        engineReady = false;
        resetEnginePresentation();
        els.engineStrip.dataset.engineState = 'error';
        els.enginePv.textContent = error.message || 'Engine unavailable';
    });
    try {
        await candidate.init();
        if (generation !== workspaceGeneration || engine !== candidate) {
            candidate.terminate();
            return;
        }
        engineReady = true;
        engineIdentity = candidate.getIdentity?.() || null;
        candidate.setOptions({ multiPV: ENGINE_MULTIPV });
        els.engineStrip.dataset.engineState = 'ready';
        if (engineEnabled) analyzeCurrentPosition();
        else {
            els.engineStrip.dataset.engineState = 'off';
            els.enginePv.textContent = 'Engine off';
        }
    } catch {
        if (engine === candidate) engineReady = false;
    }
}

function analyzeCurrentPosition() {
    engineLines.clear();
    if (!engineEnabled || !engineReady || activeTab === 'practice') {
        engine?.stop();
        if (activeTab === 'practice') {
            resetEnginePresentation({ practice: true });
        }
        return;
    }
    const fen = enginePositionFen();
    engineWorkspaceGeneration = workspaceGeneration;
    engine.stop();
    activeEngineFen = fen;
    lastEngineInfo = null;
    engine.setOptions({ multiPV: ENGINE_MULTIPV });
    engine.setPositionFEN(fen);
    engine.goDepth(ENGINE_TARGET_DEPTH);
    els.engineStrip.dataset.engineState = 'ready';
    els.enginePv.textContent = 'Calculating…';
    els.engineDepth.textContent = `Depth 0 / ${ENGINE_TARGET_DEPTH}`;
    els.engineLines.innerHTML = `<li>Calculating up to ${ENGINE_MULTIPV} principal variations…</li>`;
}

function toggleEngine() {
    engineEnabled = !engineEnabled;
    try { sessionStorage.setItem('caissa.opening-trainer.engine-enabled', String(engineEnabled)); } catch { /* preference remains in memory */ }
    els.engineToggle.setAttribute('aria-pressed', String(engineEnabled));
    els.engineStripToggle.setAttribute('aria-pressed', String(engineEnabled));
    if (!engineEnabled) {
        engine?.stop();
        resetEnginePresentation({ off: true });
    } else {
        if (!engine) {
            initEngine();
            return;
        }
        els.engineStrip.dataset.engineState = engineReady ? 'ready' : 'loading';
        analyzeCurrentPosition();
    }
}

function resolveOpening() {
    const moves = currentAnalysisMoves();
    activeOpening = openingIndex?.resolve(tree.getCurrentNode().fen || START_FEN, moves.map(move => move.san)) || null;
    if (activeOpening) {
        const method = activeOpening.transpositionVerified ? 'verified transposition' : 'sequence match';
        els.openingIdentity.innerHTML = '';
        const chip = document.createElement('span');
        chip.className = 'opening-trainer-chip';
        chip.textContent = `${activeOpening.eco || 'ECO'} · ${activeOpening.name} · ${method}`;
        els.openingIdentity.append(chip);
        els.analysisTitle.textContent = `${activeOpening.name}${activeOpening.eco ? ` · ${activeOpening.eco}` : ''}`;
    } else {
        els.openingIdentity.innerHTML = '<span class="opening-trainer-chip">Opening not yet identified</span>';
        els.analysisTitle.textContent = moves.length ? 'Custom opening line' : 'New repertoire line';
    }
}

async function syncWiki({ autoOpen = false } = {}) {
    if (!els.wikiAuto.checked || wikiLocked) return;
    const generation = workspaceGeneration;
    wikiAbort?.abort();
    const controller = new AbortController();
    wikiAbort = controller;
    const opening = activeOpening;
    const moves = opening?.transpositionVerified
        ? [...opening.moves]
        : currentAnalysisMoves().map(move => move.san);
    els.wikiMatch.textContent = opening
        ? `${opening.name} · ${opening.eco || 'ECO'} · ${opening.transpositionVerified ? 'verified by equivalent position' : 'matched by move sequence'}`
        : 'Looking for the closest Chess Opening Theory article…';
    try {
        const article = await wikiClient.load(moves, { signal: controller.signal });
        if (generation !== workspaceGeneration || controller.signal.aborted || wikiAbort !== controller) return;
        if (!article) throw new Error('No matching Wikibooks article was found.');
        els.wikiTitle.textContent = article.title.replace(/^Chess Opening Theory\/?/, '') || 'Chess Opening Theory';
        els.wikiContent.replaceChildren();
        const paragraphs = article.extract.split(/\n{2,}/)
            .map(value => value.replace(/^={2,}\s*|\s*={2,}$/gm, '').trim())
            .filter(Boolean)
            .slice(0, 12);
        for (const text of paragraphs) {
            const paragraph = document.createElement('p');
            paragraph.textContent = text.slice(0, 1200);
            els.wikiContent.append(paragraph);
        }
        els.wikiSource.href = article.pageUrl;
        els.wikiSource.title = `View source and contributor history for ${article.title}`;
        els.wikiAttribution.hidden = false;
        if (autoOpen && activeTab === 'analysis' && !wikiLocked) setTab('wikibook');
    } catch (error) {
        if (generation !== workspaceGeneration || controller.signal.aborted || wikiAbort !== controller) return;
        await renderLocalTheoryFallback(error.message, { signal: controller.signal, opening, generation });
    }
}

async function renderLocalTheoryFallback(reason = '', { signal, opening = activeOpening, generation = workspaceGeneration } = {}) {
    const fragment = document.createDocumentFragment();
    let rendered = false;
    if (opening?.eco) {
        try {
            const response = await fetch(`/data/openings/eco/${opening.eco}.json`, { cache: 'force-cache', signal });
            if (response.ok) {
                const theory = await response.json();
                const groups = [
                    ['Principles', theory.principles],
                    ['Plans for White', theory.plansWhite],
                    ['Plans for Black', theory.plansBlack],
                    ['Common mistakes', theory.commonMistakes]
                ];
                for (const [heading, values] of groups) {
                    if (!Array.isArray(values) || !values.length) continue;
                    const title = document.createElement('h3');
                    title.textContent = heading;
                    const list = document.createElement('ul');
                    values.forEach(value => {
                        const item = document.createElement('li');
                        item.textContent = value;
                        list.append(item);
                    });
                    fragment.append(title, list);
                    rendered = true;
                }
            }
        } catch {
            if (signal?.aborted) return;
            rendered = false;
        }
    }
    if (signal?.aborted || generation !== workspaceGeneration) return;
    if (!rendered) {
        const paragraph = document.createElement('p');
        paragraph.textContent = opening
            ? `${opening.name} (${opening.eco}) is recognized. Live Wikibooks theory is temporarily unavailable.`
            : 'Play a recognized opening sequence to load theory.';
        fragment.append(paragraph);
    }
    els.wikiContent.replaceChildren(fragment);
    if (reason) els.wikiMatch.textContent = `${els.wikiMatch.textContent} · ${reason}`;
    els.wikiAttribution.hidden = true;
}

async function refreshExplorer() {
    const generation = workspaceGeneration;
    els.explorerStatus.textContent = 'Loading CAISSA Explorer continuations…';
    els.explorerMoves.replaceChildren();
    try {
        const result = await explorerClient.load(tree.getCurrentNode().fen || START_FEN);
        if (generation !== workspaceGeneration) return;
        if (!result.moves.length) {
            els.explorerStatus.textContent = 'No indexed continuations for this exact position.';
            return;
        }
        els.explorerStatus.textContent = `${result.total.toLocaleString()} indexed games · exact position · ${result.version}`;
        result.moves.slice(0, 12).forEach(move => {
            const row = document.createElement('div');
            row.className = 'opening-trainer-explorer-row';
            const moveName = document.createElement('strong');
            moveName.textContent = move.san;
            const detail = document.createElement('div');
            const label = document.createElement('small');
            label.textContent = `${move.popularity.toFixed(1)}% · W ${move.white.toFixed(1)} · D ${move.draws.toFixed(1)} · B ${move.black.toFixed(1)}`;
            detail.append(moveName, label);
            const games = document.createElement('span');
            games.textContent = move.total.toLocaleString();
            const play = document.createElement('button');
            play.type = 'button';
            play.textContent = 'Play';
            play.setAttribute('aria-label', `Play ${move.san}`);
            play.addEventListener('click', () => applyAnalysisMove(move.uci));
            row.append(games, detail, play);
            els.explorerMoves.append(row);
        });
    } catch (error) {
        if (generation !== workspaceGeneration) return;
        els.explorerStatus.textContent = error.message || 'CAISSA Explorer is unavailable.';
    }
}

function renderEcoRows(query = '') {
    const needle = String(query || '').trim().toLowerCase();
    const rows = ecoRows.filter(row => !needle
        || String(row.code || row.eco || '').toLowerCase().includes(needle)
        || String(row.name || '').toLowerCase().includes(needle)
        || String(row.moves || '').toLowerCase().includes(needle)).slice(0, 20);
    els.ecoResults.replaceChildren();
    rows.forEach(row => {
        const item = document.createElement('div');
        item.className = 'opening-trainer-eco-row';
        const code = document.createElement('span');
        code.className = 'opening-trainer-eco-code';
        code.textContent = row.code || row.eco || '—';
        const content = document.createElement('div');
        const name = document.createElement('strong');
        name.textContent = row.name || 'Unknown opening';
        const moves = document.createElement('small');
        moves.textContent = String(row.moves || '');
        content.append(name, moves);
        const load = document.createElement('button');
        load.type = 'button';
        load.textContent = 'Load';
        load.setAttribute('aria-label', `Load ${row.name}`);
        load.addEventListener('click', () => loadOpeningLine(parseCatalogMoves(row.moves)));
        item.append(code, content, load);
        els.ecoResults.append(item);
    });
}

function loadOpeningLine(moves) {
    const nextGame = new Chess();
    const nextTree = TREE_API.create({ initialFen: START_FEN, selectedPly: 0 });
    try {
        for (const san of moves) {
            const fenBefore = nextGame.fen();
            const move = nextGame.move(san);
            if (!move) throw new Error(`Invalid catalog move: ${san}`);
            nextTree.insertOrSelectMove({
                from: move.from,
                to: move.to,
                promotion: move.promotion,
                san: move.san,
                uci: `${move.from}${move.to}${move.promotion || ''}`,
                color: move.color,
                fenBefore,
                fen: nextGame.fen()
            });
        }
    } catch (error) {
        nextTree.dispose();
        toast(error.message || 'This ECO line could not be loaded.');
        return;
    }
    tree.dispose();
    tree = nextTree;
    analysisGame = nextGame;
    selectedLineNodes = new Set([tree.inspect().currentNodeId].filter(id => id !== 'root'));
    setBoardPosition(nextGame.fen());
    afterAnalysisPositionChanged();
    setTab('analysis');
    toast('ECO line loaded into Analysis.');
}

function gamesAliases(query) {
    const needle = String(query || '').trim().toLowerCase();
    const aliases = [activeOpening?.name, activeOpening?.eco].filter(Boolean);
    if (/^[a-e]\d{2}$/i.test(needle)) {
        ecoRows.filter(row => String(row.code || row.eco || '').toLowerCase() === needle)
            .forEach(row => aliases.push(row.name));
    }
    return [...new Set(aliases.filter(Boolean))];
}

function renderGamesPagination(result = null) {
    const visible = Boolean(result?.pageCount > 1);
    els.gamesPagination.hidden = !visible;
    if (!result) return;
    els.gamesPageStatus.textContent = `Page ${result.page.toLocaleString()} of ${result.pageCount.toLocaleString()}`;
    els.gamesPreviousPage.disabled = result.page <= 1;
    els.gamesNextPage.disabled = result.page >= result.pageCount;
}

async function searchGames({ page = 1, query = null } = {}) {
    const generation = workspaceGeneration;
    const requestedQuery = String(query ?? els.gamesQuery.value ?? '').trim()
        || activeOpening?.name
        || activeOpening?.eco
        || '';
    if (!requestedQuery) {
        els.gamesStatus.textContent = 'Enter an opening, variation or ECO code, or analyze a recognized opening first.';
        renderGamesPagination();
        return;
    }
    els.gamesQuery.value = requestedQuery;
    const aliases = gamesAliases(requestedQuery);
    gamesAbort?.abort();
    const controller = new AbortController();
    gamesAbort = controller;
    els.searchGames.disabled = true;
    els.gamesPreviousPage.disabled = true;
    els.gamesNextPage.disabled = true;
    els.gamesStatus.textContent = 'Searching the CAISSA PGN Reader proxy…';
    try {
        const result = await gamesClient.search({ query: requestedQuery, aliases, page, signal: controller.signal, limit: 10 });
        if (generation !== workspaceGeneration || controller.signal.aborted || gamesAbort !== controller) return;
        gamesSearchPage = result.page;
        gamesSearchQuery = requestedQuery;
        gamesLoadedKey = `${requestedQuery.toLowerCase()}|${result.page}`;
        els.gamesStatus.textContent = result.collection
            ? `${result.collection.title} · ${result.total.toLocaleString()} authentic games · CAISSA PGN Reader proxy`
            : `No PGN Reader opening collection matched “${requestedQuery}”.`;
        els.gamesList.replaceChildren();
        if (!result.games.length) {
            const empty = document.createElement('p');
            empty.className = 'opening-trainer-help';
            empty.textContent = 'Try a broader opening name, a variation, or its ECO code.';
            els.gamesList.append(empty);
        }
        result.games.forEach((game, index) => {
            const row = document.createElement('article');
            row.className = 'opening-trainer-game';
            row.dataset.gameId = game.gameId;
            row.setAttribute('aria-current', String(selectedGame?.gameId === game.gameId));
            const body = document.createElement('div');
            const names = document.createElement('strong');
            names.textContent = `${((result.page - 1) * 10) + index + 1}. ${game.white} — ${game.black} ${game.result}`;
            const metadata = document.createElement('span');
            metadata.textContent = [game.event, game.site, game.year, game.eco].filter(Boolean).join(' · ');
            body.append(names, metadata);
            const load = document.createElement('button');
            load.className = 'opening-trainer-button';
            load.type = 'button';
            load.textContent = 'Load game';
            load.addEventListener('click', () => loadSelectedGame(game, load));
            row.append(body, load);
            els.gamesList.append(row);
        });
        renderGamesPagination(result);
    } catch (error) {
        if (generation === workspaceGeneration && !controller.signal.aborted && gamesAbort === controller) {
            els.gamesStatus.textContent = error.message || 'Game search is unavailable.';
            els.gamesList.replaceChildren();
            renderGamesPagination();
        }
    } finally {
        if (generation === workspaceGeneration && gamesAbort === controller) els.searchGames.disabled = false;
    }
}

async function loadSelectedGame(game, button) {
    const generation = workspaceGeneration;
    gameLoadAbort?.abort();
    const controller = new AbortController();
    gameLoadAbort = controller;
    const originalLabel = button.textContent;
    button.disabled = true;
    button.textContent = 'Loading…';
    try {
        const loaded = await gamesClient.loadGame(game, { signal: controller.signal });
        if (generation !== workspaceGeneration || controller.signal.aborted || gameLoadAbort !== controller) return;
        selectedGame = Object.freeze({ ...loaded, ...game });
        const openingPlies = Math.min(currentAnalysisMoves().length, selectedGame.moves.length);
        selectedGamePly = openingPlies;
        document.querySelectorAll('.opening-trainer-game[data-game-id]').forEach(row => {
            row.setAttribute('aria-current', String(row.dataset.gameId === game.gameId));
        });
        els.gameNotationTitle.textContent = `${game.white} vs ${game.black}`;
        els.gameNotationStatus.textContent = loaded.notationComplete
            ? `${loaded.moves.length} legal plies · complete board navigation available.`
            : `Source validation warning: full notation is shown, but board navigation stops after ${loaded.moves.length} legal plies.`;
        els.gameNotation.textContent = loaded.pgn;
        setSubtab('games', 'notation');
        setBoardPosition(selectedGameFen(), { lastMove: selectedGame.moves[selectedGamePly - 1] || null });
        updateNavigationControls();
        analyzeCurrentPosition();
        toast(`Loaded ${selectedGame.moves.length} moves. Use the footer to navigate.`);
    } catch (error) {
        if (generation === workspaceGeneration && !controller.signal.aborted) toast(error.message || 'The selected PGN could not be loaded.');
    } finally {
        button.disabled = false;
        button.textContent = originalLabel;
    }
}

function updateNotation() {
    if (selectedGame) {
        els.gameNotationTitle.textContent = `${selectedGame.white} vs ${selectedGame.black}`;
        els.gameNotationStatus.textContent = selectedGame.notationComplete
            ? `${selectedGame.moves.length} legal plies · complete board navigation available.`
            : `Source validation warning: full notation is shown, but board navigation stops after ${selectedGame.moves.length} legal plies.`;
        els.gameNotation.textContent = selectedGame.pgn;
        return;
    }
    const moves = currentAnalysisMoves();
    els.gameNotationTitle.textContent = 'Current opening line';
    els.gameNotationStatus.textContent = 'The current analysis line is legal and navigable.';
    els.gameNotation.textContent = moves.length
        ? tree.serialize({ headers: { Event: 'CAISSA Opening Trainer', Opening: activeOpening?.name || 'Custom opening' } })
        : 'No moves yet.';
}

function analysisDraftKey(identity) {
    if (identity?.kind === 'guest') return 'guest';
    if (identity?.kind === 'user' && identity.id) return `clerk:${identity.id}`;
    return null;
}

function captureAnalysisDraft(identity) {
    if (!analysisDraftKey(identity)) return;
    const snapshot = tree.inspect();
    if (snapshot.nodes.length <= 1) {
        analysisDraftStore.remove(identity);
        return;
    }
    analysisDraftStore.set(identity, Object.freeze({
        schemaVersion: 'CaissaOpeningTrainerDraft@1.0.0',
        nodes: Object.freeze(snapshot.nodes
            .filter(node => node.id !== 'root')
            .map(node => Object.freeze({ id: node.id, parentId: node.parentId, uci: node.uci }))),
        currentNodeId: snapshot.currentNodeId,
        selectedLineNodes: Object.freeze([...selectedLineNodes]),
        orientation: analysisOrientation === 'black' ? 'black' : 'white',
        repertoireColor: els.repertoireColor.value === 'black' ? 'black' : 'white',
        unsaved: hasUnsavedStudyChanges()
    }));
}

function analysisDraftFor(identity) {
    return analysisDraftKey(identity) ? analysisDraftStore.get(identity) : null;
}

function buildAnalysisDraftState(draft, { fallbackOrientation, fallbackColor }) {
    const nextTree = TREE_API.create({ initialFen: START_FEN, selectedPly: 0 });
    const idMap = new Map([['root', 'root']]);
    const selected = new Set();
    if (!draft || draft.schemaVersion !== 'CaissaOpeningTrainerDraft@1.0.0') {
        return {
            tree: nextTree,
            selected,
            orientation: fallbackOrientation,
            repertoireColor: fallbackColor,
            unsaved: false
        };
    }
    try {
        if (!Array.isArray(draft.nodes) || draft.nodes.length > 1000) throw new Error('Invalid analysis draft.');
        for (const raw of draft.nodes) {
            const parentId = idMap.get(raw.parentId);
            if (!parentId || !nextTree.selectNode(parentId, { preferMainContinuation: false }).ok) {
                throw new Error('Invalid analysis draft parent.');
            }
            const parent = nextTree.getCurrentNode();
            const game = new Chess(parent.fen || START_FEN);
            const uci = String(raw.uci || '').toLowerCase();
            let move = null;
            try {
                move = game.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] || 'q' });
            } catch {
                move = null;
            }
            if (!move) throw new Error('Invalid analysis draft move.');
            const inserted = nextTree.insertOrSelectMove({
                from: move.from,
                to: move.to,
                promotion: move.promotion,
                san: move.san,
                uci: `${move.from}${move.to}${move.promotion || ''}`,
                color: move.color,
                fenBefore: parent.fen || START_FEN,
                fen: game.fen()
            });
            if (!inserted.ok) throw new Error('Analysis draft could not be restored.');
            idMap.set(raw.id, inserted.node.id);
        }
        const currentNodeId = idMap.get(draft.currentNodeId) || 'root';
        nextTree.selectNode(currentNodeId, { preferMainContinuation: false });
        for (const nodeId of draft.selectedLineNodes || []) {
            const restoredId = idMap.get(nodeId);
            if (restoredId && restoredId !== 'root') selected.add(restoredId);
        }
        return {
            tree: nextTree,
            selected,
            orientation: draft.orientation === 'black' ? 'black' : 'white',
            repertoireColor: draft.repertoireColor === 'black' ? 'black' : 'white',
            unsaved: Boolean(draft.unsaved)
        };
    } catch {
        nextTree.dispose();
        return {
            tree: TREE_API.create({ initialFen: START_FEN, selectedPly: 0 }),
            selected,
            orientation: fallbackOrientation,
            repertoireColor: fallbackColor,
            unsaved: false
        };
    }
}

function resetWorkspace({
    draft = null,
    identityBoundary = false,
    targetTab = 'opening',
    focusOpening = true,
    notify = true
} = {}) {
    // End any gesture that began in the previous workspace before replacing
    // the identity-bound tree. An identical-FEN render does not otherwise
    // cancel Quiet Drag's captured pointer.
    board?.setInteractive(false);
    if (!identityBoundary) {
        analysisDraftStore.remove(repertoireIdentity);
    }
    workspaceGeneration += 1;
    wikiAbort?.abort();
    gamesAbort?.abort();
    gameLoadAbort?.abort();
    wikiAbort = null;
    gamesAbort = null;
    gameLoadAbort = null;
    explorerClient.cancel();
    engine?.terminate();
    engine = null;
    engineReady = false;
    engineWorkspaceGeneration = -1;
    engineLines.clear();
    lastEngineInfo = null;
    engineIdentity = null;
    activeEngineFen = '';

    const restored = buildAnalysisDraftState(draft, {
        fallbackOrientation: identityBoundary ? 'white' : analysisOrientation,
        fallbackColor: identityBoundary ? 'white' : els.repertoireColor.value
    });
    tree.dispose();
    tree = restored.tree;
    analysisGame = new Chess(tree.getCurrentNode().fen || START_FEN);
    selectedLineNodes = restored.selected;
    selectedSquare = null;
    trainingSession = null;
    trainingRecorded = false;
    trainingLineIndex = 0;
    selectedGame = null;
    selectedGamePly = 0;
    gamesLoadedKey = '';
    gamesSearchPage = 1;
    gamesSearchQuery = '';
    pendingPracticeRepertoireId = '';
    activeOpening = null;
    wikiLocked = false;
    lastSavedStudyFingerprint = '';
    analysisOrientation = restored.orientation;
    els.repertoireColor.value = restored.repertoireColor;

    if (els.saveTrainDialog.open) els.saveTrainDialog.close('reset');
    els.gamesQuery.value = '';
    els.gamesList.replaceChildren();
    els.searchGames.disabled = false;
    els.gamesStatus.textContent = 'Search the same allowlisted opening collections used by CAISSA PGN Reader.';
    renderGamesPagination();
    setSubtab('games', 'games');
    els.explorerMoves.replaceChildren();
    els.explorerStatus.textContent = 'Select CAISSA Explorer to load continuations for the current position.';
    els.practiceCard.hidden = true;
    els.practiceEmpty.hidden = false;
    els.sessionLock.hidden = true;
    els.practiceFeedback.textContent = 'CAISSA is ready.';
    els.wikiLock.setAttribute('aria-pressed', 'false');
    els.wikiLock.title = 'Lock the current article';
    els.wikiLock.querySelector('i').className = 'fas fa-lock-open';
    els.wikiTitle.textContent = 'Chess Opening Theory';
    els.wikiMatch.textContent = 'Theory follows legal move sequences and verified transpositions.';
    els.wikiContent.innerHTML = '<p>Play opening moves to load synchronized theory from Wikibooks Chess Opening Theory.</p>';
    els.wikiAttribution.hidden = true;
    els.ecoSearch.value = '';
    els.evalRailFill.style.height = '50%';
    els.evalRailScore.textContent = '—';
    els.engineEval.textContent = '—';
    els.engineDepth.textContent = 'Depth 0';
    els.engineLines.innerHTML = '<li>Waiting for Stockfish 19 Lite…</li>';
    els.enginePv.textContent = engineEnabled ? 'Starting engine…' : 'Engine off';
    els.engineStrip.dataset.engineState = engineEnabled ? 'loading' : 'off';

    setBoardPosition(analysisGame.fen());
    resolveOpening();
    updateNotation();
    renderTree();
    if (!restored.unsaved) lastSavedStudyFingerprint = studyFingerprint();
    renderRepertoireOptions();
    renderEcoRows();
    setTab(targetTab);
    board?.setInteractive(true);
    if (focusOpening && targetTab === 'opening') els.ecoSearch.focus({ preventScroll: true });
    if (els.wikiAuto.checked) syncWiki();
    if (engineEnabled && runtimeInitialized) initEngine();
    if (notify) toast('New opening workspace ready. Session repertoires were preserved.');
}

function requestNewStudy() {
    if (!hasUnsavedStudyChanges()) {
        resetWorkspace();
        return;
    }
    if (typeof els.newStudyDialog.showModal === 'function') els.newStudyDialog.showModal();
    else toast('Save or discard the current study before starting a new opening.');
}

function setSubtab(group, view) {
    const buttonSelector = `[data-${group}-view]`;
    const panelSelector = `[data-${group}-panel]`;
    document.querySelectorAll(buttonSelector).forEach(button => {
        const active = button.dataset[`${group}View`] === view;
        button.classList.toggle('is-active', active);
        button.setAttribute('aria-selected', String(active));
    });
    document.querySelectorAll(panelSelector).forEach(panel => {
        panel.hidden = panel.dataset[`${group}Panel`] !== view;
    });
    if (group === 'opening' && view === 'explorer') refreshExplorer();
}

function setTab(tab) {
    if (!['analysis', 'practice', 'games', 'opening', 'wikibook'].includes(tab)) return;
    activeTab = tab;
    document.querySelectorAll('[data-trainer-tab]').forEach(button => {
        const active = button.dataset.trainerTab === tab;
        button.classList.toggle('is-active', active);
        button.setAttribute('aria-selected', String(active));
        button.tabIndex = active ? 0 : -1;
    });
    document.querySelectorAll('[data-trainer-panel]').forEach(panel => {
        panel.hidden = panel.dataset.trainerPanel !== tab;
    });
    if (tab === 'practice' && trainingSession) {
        board.setOrientation(trainingSession.userColor === 'b' ? 'black' : 'white');
        setBoardPosition(trainingSession.fen);
    } else if (tab === 'games' && selectedGame) {
        board.setOrientation(analysisOrientation);
        setBoardPosition(selectedGameFen(), { lastMove: selectedGame.moves[selectedGamePly - 1] || null });
    } else {
        board.setOrientation(analysisOrientation);
        setBoardPosition(tree.getCurrentNode().fen || START_FEN);
    }
    if (tab === 'games') {
        updateNotation();
        const suggested = activeOpening?.name || activeOpening?.eco || '';
        if (!els.gamesQuery.value && suggested) els.gamesQuery.value = suggested;
        const query = els.gamesQuery.value.trim();
        const key = `${query.toLowerCase()}|1`;
        if (query && key !== gamesLoadedKey) searchGames({ page: 1, query });
    }
    if (tab === 'opening') refreshExplorer();
    renderTree();
    analyzeCurrentPosition();
}

function afterAnalysisPositionChanged({ keepWikiArticle = false } = {}) {
    renderTree();
    resolveOpening();
    gamesAbort?.abort();
    gameLoadAbort?.abort();
    selectedGame = null;
    selectedGamePly = 0;
    gamesSearchPage = 1;
    updateNotation();
    gamesLoadedKey = '';
    els.gamesQuery.value = activeOpening?.name || activeOpening?.eco || '';
    els.gamesList.replaceChildren();
    els.gamesStatus.textContent = activeOpening
        ? `Ready to search PGN Reader collections for ${activeOpening.name}.`
        : 'Enter an opening, variation or ECO code to search the PGN Reader collections.';
    renderGamesPagination();
    if (!keepWikiArticle) syncWiki({ autoOpen: true });
    if (document.querySelector('[data-opening-panel="explorer"]')?.hidden === false) refreshExplorer();
    analyzeCurrentPosition();
    captureAnalysisDraft(repertoireIdentity);
}

function navigateTree(action) {
    if (activeTab === 'practice') return;
    if (activeTab === 'games' && selectedGame) {
        if (action === 'first') selectedGamePly = 0;
        if (action === 'previous') selectedGamePly = Math.max(0, selectedGamePly - 1);
        if (action === 'next') selectedGamePly = Math.min(selectedGame.moves.length, selectedGamePly + 1);
        if (action === 'last') selectedGamePly = selectedGame.moves.length;
        setBoardPosition(selectedGameFen(), { lastMove: selectedGame.moves[selectedGamePly - 1] || null });
        updateNavigationControls();
        analyzeCurrentPosition();
        return;
    }
    const response = tree[action]();
    if (!response?.ok) return;
    analysisGame = new Chess(tree.getCurrentNode().fen || START_FEN);
    setBoardPosition(analysisGame.fen());
    afterAnalysisPositionChanged({ keepWikiArticle: wikiLocked });
}

function changePracticeColor(nextColor) {
    if (!trainingSession) return;
    const currentColor = trainingSession.userColor === 'b' ? 'black' : 'white';
    if (nextColor === currentColor) return;
    const confirmed = window.confirm(`Restart this practice session and play as ${nextColor === 'black' ? 'Black' : 'White'}?`);
    if (!confirmed) {
        setPracticeColor(currentColor);
        return;
    }
    const repertoireId = trainingSession.snapshot.id;
    startPractice(repertoireId, trainingLineIndex, { userColor: nextColor });
    renderPractice(`Session restarted. You are playing as ${nextColor === 'black' ? 'Black' : 'White'}.`);
}

function bindEvents() {
    document.querySelectorAll('[data-trainer-tab]').forEach((button, index, buttons) => {
        button.addEventListener('click', () => setTab(button.dataset.trainerTab));
        button.addEventListener('keydown', event => {
            if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
            event.preventDefault();
            let nextIndex = index;
            if (event.key === 'ArrowLeft') nextIndex = (index - 1 + buttons.length) % buttons.length;
            if (event.key === 'ArrowRight') nextIndex = (index + 1) % buttons.length;
            if (event.key === 'Home') nextIndex = 0;
            if (event.key === 'End') nextIndex = buttons.length - 1;
            buttons[nextIndex].focus();
            setTab(buttons[nextIndex].dataset.trainerTab);
        });
    });
    document.querySelectorAll('[data-games-view]').forEach(button => button.addEventListener('click', () => setSubtab('games', button.dataset.gamesView)));
    document.querySelectorAll('[data-opening-view]').forEach(button => button.addEventListener('click', () => setSubtab('opening', button.dataset.openingView)));
    els.newStudy.addEventListener('click', requestNewStudy);
    els.save.addEventListener('click', () => saveRepertoire());
    els.saveTrain.addEventListener('click', () => saveRepertoire({ train: true }));
    els.repertoireColor.addEventListener('change', () => {
        updateSaveControls();
        captureAnalysisDraft(repertoireIdentity);
    });
    els.repertoireSelect.addEventListener('change', renderLineOptions);
    els.startPractice.addEventListener('click', () => startPractice());
    [els.practicePlayWhite, els.practicePlayBlack].forEach(input => {
        input.addEventListener('change', () => {
            if (input.checked) changePracticeColor(input.value);
        });
    });
    els.retryPractice.addEventListener('click', () => startPractice(
        trainingSession?.snapshot.id || els.repertoireSelect.value,
        trainingLineIndex,
        { userColor: trainingSession?.userColor || practiceColor() }
    ));
    els.hint.addEventListener('click', requestHint);
    els.reveal.addEventListener('click', revealPracticeMove);
    els.nextLine.addEventListener('click', startNextPracticeLine);
    els.gamesSearchForm.addEventListener('submit', event => {
        event.preventDefault();
        searchGames({ page: 1, query: els.gamesQuery.value });
    });
    els.gamesPreviousPage.addEventListener('click', () => searchGames({ page: Math.max(1, gamesSearchPage - 1), query: gamesSearchQuery }));
    els.gamesNextPage.addEventListener('click', () => searchGames({ page: gamesSearchPage + 1, query: gamesSearchQuery }));
    els.ecoSearch.addEventListener('input', () => renderEcoRows(els.ecoSearch.value));
    els.wikiAuto.addEventListener('change', () => {
        if (els.wikiAuto.checked && !wikiLocked) syncWiki();
    });
    els.wikiReturn.addEventListener('click', () => setTab('analysis'));
    els.wikiLock.addEventListener('click', () => {
        wikiLocked = !wikiLocked;
        els.wikiLock.setAttribute('aria-pressed', String(wikiLocked));
        els.wikiLock.title = wikiLocked ? 'Unlock and follow the analyzed position' : 'Lock the current article';
        els.wikiLock.querySelector('i').className = wikiLocked ? 'fas fa-lock' : 'fas fa-lock-open';
        toast(wikiLocked ? 'WikiBook article locked.' : 'WikiBook now follows the analyzed position.');
        if (!wikiLocked && els.wikiAuto.checked) syncWiki();
    });
    els.flip.addEventListener('click', () => {
        const next = board.getOrientation() === 'white' ? 'black' : 'white';
        board.setOrientation(next);
        if (activeTab !== 'practice') {
            analysisOrientation = next;
            captureAnalysisDraft(repertoireIdentity);
        }
    });
    els.engineToggle.addEventListener('click', toggleEngine);
    els.engineStripToggle.addEventListener('click', toggleEngine);
    els.confirmPractice.addEventListener('click', () => {
        const repertoireId = pendingPracticeRepertoireId;
        pendingPracticeRepertoireId = '';
        if (!repertoireId) return;
        const userColor = dialogPracticeColor();
        setPracticeColor(userColor);
        setTab('practice');
        startPractice(repertoireId, 0, { userColor });
    });
    els.saveTrainDialog.addEventListener('close', () => { pendingPracticeRepertoireId = ''; });
    els.newStudyDialog.addEventListener('close', () => {
        if (els.newStudyDialog.returnValue === 'save') {
            if (saveRepertoire()) resetWorkspace();
        } else if (els.newStudyDialog.returnValue === 'discard') {
            resetWorkspace();
        }
    });
    els.first.addEventListener('click', () => navigateTree('first'));
    els.previous.addEventListener('click', () => navigateTree('previous'));
    els.next.addEventListener('click', () => navigateTree('next'));
    els.last.addEventListener('click', () => navigateTree('last'));
    window.addEventListener('beforeunload', () => {
        captureAnalysisDraft(repertoireIdentity);
        unsubscribeAuth?.();
        engine?.terminate();
        explorerClient.cancel();
        wikiAbort?.abort();
        gamesAbort?.abort();
        gameLoadAbort?.abort();
        board?.destroy();
    });
}

async function loadCatalogs() {
    try {
        const [ecoResponse, openingResponse] = await Promise.all([
            fetch('/data/eco/eco_codes.json', { cache: 'force-cache' }),
            fetch('/data/openings.json', { cache: 'force-cache' })
        ]);
        if (!ecoResponse.ok || !openingResponse.ok) throw new Error('Opening catalog request failed.');
        ecoRows = await ecoResponse.json();
        openingRows = await openingResponse.json();
        openingIndex = buildOpeningIndex(openingRows);
        renderEcoRows();
        resolveOpening();
        syncWiki();
    } catch (error) {
        els.ecoResults.textContent = error.message || 'Opening catalog is unavailable.';
    }
}

function clearVisibleRepertoireState({ analysisDraft = null } = {}) {
    resetWorkspace({
        draft: analysisDraft,
        identityBoundary: true,
        targetTab: 'analysis',
        focusOpening: false,
        notify: false
    });
    if (els.saveTrainDialog.open) els.saveTrainDialog.close('identity-change');
}

function applyRepertoireIdentity(auth) {
    if (!auth?.isLoaded) return;
    const next = auth.isSignedIn && auth.userId
        ? { kind: 'user', id: String(auth.userId) }
        : { kind: 'guest', id: null };
    if (repertoireIdentity?.kind === next.kind && repertoireIdentity?.id === next.id) return;

    captureAnalysisDraft(repertoireIdentity);
    repertoireStore.clearIdentity();
    repertoireIdentity = null;
    renderRepertoireOptions();
    updateSaveControls();

    try {
        repertoireIdentity = repertoireStore.setIdentity(next);
    } catch {
        clearVisibleRepertoireState();
        renderRepertoireOptions();
        return;
    }
    clearVisibleRepertoireState({ analysisDraft: analysisDraftFor(repertoireIdentity) });
    renderRepertoireOptions();
    updateSaveControls();
}

function bindRepertoireIdentity() {
    const auth = window.CAISSA_AUTH;
    if (!auth) {
        applyRepertoireIdentity({ isLoaded: true, isSignedIn: false, userId: null });
        return;
    }
    if (typeof auth.onAuthStateChange === 'function') {
        unsubscribeAuth = auth.onAuthStateChange(next => applyRepertoireIdentity(next));
    }
    if (auth.isLoaded) applyRepertoireIdentity(auth);
    else if (typeof auth.whenReady === 'function') {
        void auth.whenReady()
            .then(next => applyRepertoireIdentity(next))
            .catch(() => applyRepertoireIdentity({ isLoaded: true, isSignedIn: false, userId: null }));
    }
}

function initBoard() {
    board = createBoardAdapter(els.board, {
        label: 'CAISSA Opening Trainer board',
        position: START_FEN,
        orientation: analysisOrientation,
        animation: false,
        coalesce: true,
        tapPolicy: 'intent-only',
        dragPolicy: 'all',
        onSquareTap: selectBoardSquare,
        onMoveAttempt: handleMoveAttempt,
        onDragStart: canDrag,
        onPromotionRequest: () => 'q',
        onError: error => toast(error.message || 'Board error')
    });
}

function exposeQaApi() {
    window.CaissaOpeningTrainer = Object.freeze({
        getState: () => Object.freeze({
            activeTab,
            analysis: tree.inspect(),
            training: trainingSession?.state() || null,
            repertoires: repertoireStore.list(),
            repertoireIdentity: repertoireIdentity ? { ...repertoireIdentity } : null,
            selectedGame: selectedGame ? Object.freeze({ gameId: selectedGame.gameId, ply: selectedGamePly, totalPlies: selectedGame.moves.length }) : null,
            boardMetrics: board.getMetrics(),
            opening: activeOpening,
            engineEnabled,
            engine: Object.freeze({
                displayName: ENGINE_DISPLAY_NAME,
                ready: engineReady,
                identity: engineIdentity ? { ...engineIdentity } : null,
                targetDepth: ENGINE_TARGET_DEPTH,
                multiPV: ENGINE_MULTIPV,
                fen: activeEngineFen,
                depth: lastEngineInfo?.depth || 0,
                score: lastEngineInfo ? formatScore(lastEngineInfo, lastEngineInfo.fen || activeEngineFen).text : null,
                requestId: lastEngineInfo?.requestId || null
            }),
            unsavedStudy: hasUnsavedStudyChanges(),
            workspaceGeneration
        }),
        setTab,
        loadOpeningLine,
        searchGames,
        startPractice,
        requestNewStudy,
        resetWorkspace,
        destroy: () => {
            captureAnalysisDraft(repertoireIdentity);
            unsubscribeAuth?.();
            engine?.terminate();
            explorerClient.cancel();
            board.destroy();
        }
    });
}

async function init() {
    initBoard();
    bindEvents();
    renderTree();
    renderRepertoireOptions();
    updateNotation();
    setTab('analysis');
    exposeQaApi();
    bindRepertoireIdentity();
    runtimeInitialized = true;
    await Promise.allSettled([loadCatalogs(), initEngine()]);
}

init();
