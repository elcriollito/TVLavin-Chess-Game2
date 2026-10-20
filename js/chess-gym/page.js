import { CaissaBoardAdapter } from '../board/caissa-board-adapter.js';

const $ = id => document.getElementById(id);

const drills = Object.freeze([
  {
    id: 'loose-pieces',
    group: 'Board Vision',
    label: 'Loose Pieces',
    short: 'LPDO scanner',
    ready: true,
    description: 'Find pieces that are hanging or insufficiently defended before they become blunders.'
  },
  {
    id: 'position-memory',
    group: 'Board Vision',
    label: 'Position Memory',
    short: 'See → hide → recall',
    ready: false,
    description: 'Memorize a position, hide the board, then reconstruct the important details.'
  },
  {
    id: 'knight-vision',
    group: 'Board Vision',
    label: 'Knight Vision',
    short: 'Route visualization',
    ready: false,
    description: 'Build instant awareness of knight routes and reachable squares.'
  },
  {
    id: 'checks-scan',
    group: 'Tactical Awareness',
    label: 'Checks Scan',
    short: 'Forcing-move habit',
    ready: true,
    description: 'Scan for checking resources before calculating quieter candidate moves.'
  },
  {
    id: 'captures-scan',
    group: 'Tactical Awareness',
    label: 'Captures Scan',
    short: 'See forcing captures',
    ready: true,
    description: 'Identify immediate captures quickly and separate useful captures from noise.'
  },
  {
    id: 'threat-scan',
    group: 'Tactical Awareness',
    label: 'Threat Scan',
    short: 'Opponent danger',
    ready: true,
    description: 'Recognize what the opponent is attacking before choosing your own plan.'
  },
  {
    id: 'what-changed',
    group: 'Tactical Awareness',
    label: 'What Changed?',
    short: 'Last-move awareness',
    ready: true,
    description: 'Train the habit of asking what the opponent\'s last move attacked, opened or weakened.'
  },
  {
    id: 'attackers-defenders',
    group: 'Calculation',
    label: 'Attackers vs Defenders',
    short: 'Count before acting',
    ready: true,
    description: 'Spot contested pieces and compare attackers with defenders before committing.'
  },
  {
    id: 'save-game',
    group: 'Defense',
    label: 'Save the Game',
    short: 'Find resources',
    ready: false,
    description: 'Practice defensive resources, simplification, counterplay and drawing ideas.'
  },
  {
    id: 'convert-win',
    group: 'Conversion',
    label: 'Convert the Win',
    short: 'Finish better positions',
    ready: false,
    description: 'Turn a real advantage into a win without letting the position slip away.'
  },
  {
    id: 'quick-decision',
    group: 'Time',
    label: 'Quick Decision',
    short: 'Practical clock training',
    ready: false,
    description: 'Practice making sound decisions inside a controlled time budget.'
  }
]);

const exercises = Object.freeze({
  'loose-pieces': [
    {
      fen: '4k3/8/8/3n4/8/8/4Q3/4K3 w - - 0 1',
      prompt: 'Tap the black piece that is completely undefended.',
      answerSquares: ['d5'],
      success: 'Correct. The knight on d5 is loose.',
      note: 'Loose Piece Scanner · 1'
    },
    {
      fen: '4k3/8/8/8/8/2b5/8/3R2K1 w - - 0 1',
      prompt: 'Find the loose black piece.',
      answerSquares: ['c3'],
      success: 'Correct. The bishop on c3 has no defender.',
      note: 'Loose Piece Scanner · 2'
    }
  ],
  'checks-scan': [
    {
      fen: '4k3/8/8/8/8/8/4Q3/4K3 w - - 0 1',
      prompt: 'Tap the white piece that can create an immediate checking move.',
      answerSquares: ['e2'],
      success: 'Correct. Start every forcing-move scan by noticing the queen checks.',
      note: 'Checks Scan · 1'
    },
    {
      fen: '6k1/8/8/8/8/8/5R2/6K1 w - - 0 1',
      prompt: 'Which white piece owns the immediate checking idea?',
      answerSquares: ['f2'],
      success: 'Correct. The rook can enter the checking lane immediately.',
      note: 'Checks Scan · 2'
    }
  ],
  'captures-scan': [
    {
      fen: '4k3/8/8/3r4/8/8/3Q4/4K3 w - - 0 1',
      prompt: 'Tap the white piece with the obvious immediate capture.',
      answerSquares: ['d2'],
      success: 'Correct. The queen on d2 can capture the rook on d5.',
      note: 'Captures Scan · 1'
    },
    {
      fen: '4k3/8/8/8/2r5/8/2Q5/4K3 w - - 0 1',
      prompt: 'Which white piece can immediately take the hanging rook?',
      answerSquares: ['c2'],
      success: 'Correct. The queen on c2 sees the rook on c4.',
      note: 'Captures Scan · 2'
    }
  ],
  'threat-scan': [
    {
      fen: '4k3/8/8/8/8/3q4/4R3/4K3 w - - 0 1',
      prompt: 'Tap the white piece currently under direct attack.',
      answerSquares: ['e2'],
      success: 'Correct. The rook on e2 is attacked by the queen on d3.',
      note: 'Threat Scan · 1'
    },
    {
      fen: '4k3/8/8/2b5/8/8/5N2/4K3 w - - 0 1',
      prompt: 'Which white piece is attacked right now?',
      answerSquares: ['f2'],
      success: 'Correct. The bishop on c5 attacks the knight on f2.',
      note: 'Threat Scan · 2'
    }
  ],
  'what-changed': [
    {
      fen: '4k3/8/8/8/3n4/8/2B5/4K3 w - - 0 1',
      prompt: 'Black just played ...Nd4. Tap the white piece that became attacked.',
      answerSquares: ['c2'],
      success: 'Correct. The move to d4 created a direct attack on the bishop on c2.',
      lastMove: { from: 'f5', to: 'd4' },
      note: 'What Changed? · 1'
    },
    {
      fen: '4k3/8/8/4r3/8/8/4Q3/4K3 w - - 0 1',
      prompt: 'Black moved the rook to e5. Which white piece is now in the line of fire?',
      answerSquares: ['e2'],
      success: 'Correct. The rook move opened direct pressure down the e-file onto the queen.',
      lastMove: { from: 'e8', to: 'e5' },
      note: 'What Changed? · 2'
    }
  ],
  'attackers-defenders': [
    {
      fen: '4k3/8/8/3r4/3N4/8/3Q4/4K3 w - - 0 1',
      prompt: 'Tap the white piece that is both attacked and defended.',
      answerSquares: ['d4'],
      success: 'Correct. The knight on d4 is attacked by the rook and defended by the queen.',
      note: 'Attackers vs Defenders · 1'
    },
    {
      fen: '4k3/8/8/4b3/3N4/8/3Q4/4K3 w - - 0 1',
      prompt: 'Find the contested white piece before calculating exchanges.',
      answerSquares: ['d4'],
      success: 'Correct. The knight on d4 is the contested piece.',
      note: 'Attackers vs Defenders · 2'
    }
  ]
});

const state = {
  orientation: 'white',
  primaryTab: 'training',
  trainingMode: 'train',
  progressMode: 'caissa',
  drillId: 'loose-pieces',
  exerciseIndex: -1,
  exercise: null,
  solved: false,
  attempts: 0,
  correct: 0,
  log: [],
  perDrill: new Map(),
  dailyMode: false,
  dailyIndex: 0
};

const board = new CaissaBoardAdapter($('gym-board'), {
  position: 'start',
  orientation: state.orientation,
  interactive: true,
  animation: false,
  dragPolicy: 'none',
  label: 'CAISSA Chess Gym training board'
});

const dailyQueue = ['loose-pieces', 'checks-scan', 'what-changed', 'attackers-defenders'];

function drillById(id) {
  return drills.find(drill => drill.id === id);
}

function setPrompt(text, tone) {
  const prompt = $('current-drill-prompt');
  prompt.textContent = text;
  prompt.classList.toggle('is-correct', tone === 'correct');
  prompt.classList.toggle('is-wrong', tone === 'wrong');
}

function renderCatalog() {
  const groups = new Map();
  for (const drill of drills) {
    if (!groups.has(drill.group)) groups.set(drill.group, []);
    groups.get(drill.group).push(drill);
  }

  const nodes = [];
  for (const [groupName, groupDrills] of groups) {
    const group = document.createElement('section');
    group.className = 'chess-gym-skill-group';

    const heading = document.createElement('h3');
    heading.textContent = groupName;

    const grid = document.createElement('div');
    grid.className = 'chess-gym-skill-grid';

    for (const drill of groupDrills) {
      const button = document.createElement('button');
      const title = document.createElement('strong');
      const meta = document.createElement('small');

      button.type = 'button';
      button.className = 'chess-gym-skill-button';
      button.dataset.drillId = drill.id;
      button.dataset.ready = String(drill.ready);
      button.setAttribute('aria-pressed', String(drill.id === state.drillId));

      title.textContent = drill.label;
      meta.textContent = drill.ready ? drill.short : drill.short + ' · next phase';

      button.append(title, meta);
      button.addEventListener('click', () => selectDrill(drill.id, { load: drill.ready }));
      grid.append(button);
    }

    group.append(heading, grid);
    nodes.push(group);
  }

  $('skill-groups').replaceChildren(...nodes);
  $('ready-count').textContent = drills.filter(drill => drill.ready).length + ' ready';
}

function renderDrillHeader() {
  const drill = drillById(state.drillId);
  $('current-drill-title').textContent = drill.label;
  $('current-drill-description').textContent = drill.description;
  $('footer-drill-name').textContent = drill.label;
  $('gym-board-kicker').textContent = drill.group;

  const badge = $('current-drill-status');
  badge.textContent = drill.ready ? 'Ready' : 'Next phase';
  badge.classList.toggle('is-next', !drill.ready);

  for (const button of document.querySelectorAll('.chess-gym-skill-button')) {
    button.setAttribute('aria-pressed', String(button.dataset.drillId === state.drillId));
  }

  if (!drill.ready) {
    state.exercise = null;
    state.exerciseIndex = -1;
    state.solved = false;
    board.setPosition('start', { animate: false });
    board.clearHighlights();
    board.clearArrows();
    $('gym-board-status').textContent = drill.label + ' foundation staged';
    $('gym-position-note').textContent = 'Module architecture reserved';
    $('gym-position-count').textContent = 'Next phase';
    $('next-position').textContent = 'Planned';
    $('next-position').disabled = true;
    $('footer-step').textContent = 'Trainer module not wired yet';
    setPrompt('The workspace and skill contract are ready; this drill needs its dedicated interaction module next.', '');
    return;
  }

  $('next-position').disabled = false;
  $('next-position').textContent = state.exercise ? 'Next' : 'Start';
}

function selectDrill(id, options = {}) {
  const drill = drillById(id);
  if (!drill) return;

  state.drillId = id;
  state.dailyMode = options.keepDaily === true && state.dailyMode;
  if (!options.keepDaily) state.dailyMode = false;
  state.exerciseIndex = -1;
  state.exercise = null;
  state.solved = false;
  renderDrillHeader();

  if (options.load && drill.ready) loadNextExercise({ resetIndex: true });
}

function renderExercise() {
  const drill = drillById(state.drillId);
  const item = state.exercise;
  if (!item) return;

  state.solved = false;
  board.setReadOnly(false);
  board.setPosition(item.fen, { animate: false });
  board.clearHighlights();
  board.clearArrows();

  if (item.lastMove) {
    board.highlightSquares([
      { square: item.lastMove.from, type: 'last' },
      { square: item.lastMove.to, type: 'last' }
    ]);
    board.drawArrow(item.lastMove.from, item.lastMove.to, { color: '#f2b84b', opacity: 0.58 });
  }

  $('gym-board-status').textContent = 'Scan first. Then answer.';
  $('gym-position-note').textContent = item.note;
  const count = exercises[state.drillId].length;
  $('gym-position-count').textContent = 'Position ' + (state.exerciseIndex + 1) + ' / ' + count;
  $('footer-step').textContent = 'Position ' + (state.exerciseIndex + 1) + ' of ' + count;
  $('next-position').textContent = 'Next';
  setPrompt(item.prompt, '');
  renderDrillHeader();
}

function loadNextExercise(options = {}) {
  const pool = exercises[state.drillId];
  if (!pool || !pool.length) return;

  if (options.resetIndex) state.exerciseIndex = 0;
  else state.exerciseIndex = (state.exerciseIndex + 1 + pool.length) % pool.length;

  state.exercise = pool[state.exerciseIndex];
  renderExercise();
}

function loadNextDaily() {
  state.dailyMode = true;
  const id = dailyQueue[state.dailyIndex % dailyQueue.length];
  state.dailyIndex += 1;
  state.drillId = id;
  state.exerciseIndex = -1;
  state.exercise = null;
  state.solved = false;
  renderCatalog();
  renderDrillHeader();
  loadNextExercise({ resetIndex: true });
  $('footer-step').textContent = 'Daily session · ' + state.dailyIndex + ' / ' + dailyQueue.length;
}

function addAttemptLog(drill, square, correct) {
  state.log.unshift({
    drill: drill.label,
    square,
    correct
  });
  state.log = state.log.slice(0, 30);

  const nodes = state.log.map(item => {
    const li = document.createElement('li');
    const label = document.createElement('span');
    const outcome = document.createElement('strong');
    li.className = item.correct ? 'is-correct' : 'is-wrong';
    label.textContent = item.drill + ' · ' + item.square;
    outcome.textContent = item.correct ? '✓' : '×';
    li.append(label, outcome);
    return li;
  });

  $('attempt-log').replaceChildren(...nodes);
}

function updateDrillStats(id, correct) {
  const current = state.perDrill.get(id) || { attempts: 0, correct: 0 };
  current.attempts += 1;
  if (correct) current.correct += 1;
  state.perDrill.set(id, current);
}

function renderProgress() {
  $('session-score').textContent = state.correct + ' / ' + state.attempts;
  $('progress-attempts').textContent = String(state.attempts);
  $('progress-correct').textContent = String(state.correct);
  $('progress-accuracy').textContent = state.attempts ? Math.round((state.correct / state.attempts) * 100) + '%' : '—';

  const groupScores = new Map();
  for (const [id, stats] of state.perDrill) {
    const drill = drillById(id);
    if (!drill || !stats.attempts) continue;
    const entry = groupScores.get(drill.group) || { attempts: 0, correct: 0 };
    entry.attempts += stats.attempts;
    entry.correct += stats.correct;
    groupScores.set(drill.group, entry);
  }

  const map = {
    Vision: 'Board Vision',
    Awareness: 'Tactical Awareness',
    Calculation: 'Calculation',
    Defense: 'Defense',
    Conversion: 'Conversion',
    Time: 'Time'
  };

  for (const row of document.querySelectorAll('.chess-gym-skill-bars > div')) {
    const label = row.querySelector('span').textContent;
    const stats = groupScores.get(map[label]);
    const score = stats && stats.attempts ? Math.round((stats.correct / stats.attempts) * 100) : 0;
    row.querySelector('progress').value = score;
    row.querySelector('strong').textContent = stats && stats.attempts ? String(score) : '—';
  }

  const misses = Array.from(state.perDrill.entries())
    .map(([id, stats]) => ({ id, misses: stats.attempts - stats.correct, attempts: stats.attempts }))
    .filter(item => item.attempts > 0)
    .sort((a, b) => b.misses - a.misses || b.attempts - a.attempts);

  if (!misses.length) {
    $('caissa-guidance').textContent = 'Complete a few drills and CAISSA will point you toward the skill that needs the most repetition.';
  } else {
    const weakest = drillById(misses[0].id);
    if (misses[0].misses > 0) {
      $('caissa-guidance').textContent = 'Your current session shows the most misses in ' + weakest.label + '. Repeat that skill before moving on.';
    } else {
      $('caissa-guidance').textContent = 'Clean session so far. Keep the mixed scan going to build speed without sacrificing accuracy.';
    }
  }
}

function handleSquareTap(square) {
  const item = state.exercise;
  const drill = drillById(state.drillId);
  if (!item || !drill || state.solved) return;

  const correct = item.answerSquares.includes(square);
  state.attempts += 1;
  if (correct) state.correct += 1;
  updateDrillStats(state.drillId, correct);
  addAttemptLog(drill, square, correct);

  board.clearHighlights();
  if (item.lastMove) {
    board.highlightSquares([
      { square: item.lastMove.from, type: 'last' },
      { square: item.lastMove.to, type: 'last' },
      { square, type: correct ? 'hint' : 'error' }
    ]);
  } else {
    board.highlightSquares([{ square, type: correct ? 'hint' : 'error' }]);
  }

  if (correct) {
    state.solved = true;
    board.setReadOnly(true);
    $('gym-board-status').textContent = 'Correct · pattern recognized';
    setPrompt(item.success, 'correct');
  } else {
    $('gym-board-status').textContent = 'Not that one · scan again';
    setPrompt('Not quite. Re-scan the whole position before tapping again.', 'wrong');
  }

  renderProgress();
}

function switchPrimaryTab(name) {
  const names = ['training', 'moves', 'progress'];
  state.primaryTab = name;
  for (const tabName of names) {
    const active = tabName === name;
    $('tab-' + tabName).setAttribute('aria-selected', String(active));
    $('tab-' + tabName).tabIndex = active ? 0 : -1;
    $('panel-' + tabName).hidden = !active;
  }
}

function switchTrainingMode(name) {
  state.trainingMode = name;
  $('mode-train').setAttribute('aria-selected', String(name === 'train'));
  $('mode-learn').setAttribute('aria-selected', String(name === 'learn'));
  $('training-train').hidden = name !== 'train';
  $('training-learn').hidden = name !== 'learn';
}

function switchProgressMode(name) {
  state.progressMode = name;
  $('progress-caissa').setAttribute('aria-selected', String(name === 'caissa'));
  $('progress-mentor').setAttribute('aria-selected', String(name === 'mentor'));
  $('progress-caissa-panel').hidden = name !== 'caissa';
  $('progress-mentor-panel').hidden = name !== 'mentor';
}

function resetSession() {
  state.attempts = 0;
  state.correct = 0;
  state.log = [];
  state.perDrill.clear();
  state.dailyMode = false;
  state.dailyIndex = 0;
  $('attempt-log').innerHTML = '<li class="is-empty">No attempts yet.</li>';
  renderProgress();
  if (drillById(state.drillId).ready) loadNextExercise({ resetIndex: true });
}

function practiceWeakness() {
  const candidates = Array.from(state.perDrill.entries())
    .map(([id, stats]) => ({ id, misses: stats.attempts - stats.correct, attempts: stats.attempts }))
    .filter(item => drillById(item.id)?.ready)
    .sort((a, b) => b.misses - a.misses || b.attempts - a.attempts);
  selectDrill(candidates[0]?.id || 'loose-pieces', { load: true });
  switchPrimaryTab('training');
  switchTrainingMode('train');
}

board.on('squareTap', handleSquareTap);

$('flip-board').addEventListener('click', () => {
  state.orientation = state.orientation === 'white' ? 'black' : 'white';
  board.setOrientation(state.orientation);
});

for (const name of ['training', 'moves', 'progress']) {
  $('tab-' + name).addEventListener('click', () => switchPrimaryTab(name));
  $('tab-' + name).addEventListener('keydown', event => {
    if (!['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
    event.preventDefault();
    const tabs = ['training', 'moves', 'progress'];
    const delta = event.key === 'ArrowRight' ? 1 : tabs.length - 1;
    const next = tabs[(tabs.indexOf(name) + delta) % tabs.length];
    switchPrimaryTab(next);
    $('tab-' + next).focus();
  });
}

$('mode-train').addEventListener('click', () => switchTrainingMode('train'));
$('mode-learn').addEventListener('click', () => switchTrainingMode('learn'));
$('progress-caissa').addEventListener('click', () => switchProgressMode('caissa'));
$('progress-mentor').addEventListener('click', () => switchProgressMode('mentor'));

$('start-daily').addEventListener('click', () => {
  state.dailyMode = true;
  state.dailyIndex = 0;
  loadNextDaily();
});

$('next-position').addEventListener('click', () => {
  if (!drillById(state.drillId).ready) return;
  if (state.dailyMode) loadNextDaily();
  else loadNextExercise({ resetIndex: state.exerciseIndex < 0 });
});

$('reset-session').addEventListener('click', resetSession);
$('practice-weakness').addEventListener('click', practiceWeakness);
$('repeat-drill').addEventListener('click', () => {
  selectDrill(state.drillId, { load: drillById(state.drillId).ready });
  switchPrimaryTab('training');
});

renderCatalog();
renderDrillHeader();
renderProgress();
loadNextExercise({ resetIndex: true });

window.addEventListener('beforeunload', () => board.destroy(), { once: true });
