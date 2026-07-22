import { createEndgameCurriculum } from '../../js/endgame-trainer/endgame-curriculum.js';
import { createTrainingMemory, recordTrainingSession, summarizeTrainingMemory, exportTrainingMemory, importTrainingMemory } from '../../js/endgame-trainer/endgame-training-memory.js';

const lessons = createEndgameCurriculum().getSnapshot().paths.flatMap(path => path.lessons);
let memory = createTrainingMemory();
for (let index = 0; index < 500; index += 1) {
    const lesson = lessons[index % lessons.length], solved = index % 5 !== 0;
    memory = recordTrainingSession(memory, { id: `qa-${index}`, lessonId: lesson.id, theme: lesson.theme, outcome: solved ? 'solved' : 'failed', hintsUsed: index % 4, attempts: index % 3 + 1, durationMs: 30000 + index * 100, finalResult: solved ? 'checkmate' : 'resignation', classifications: solved ? { BEST: 2, GOOD: 1, SUCCESS: 1 } : { INACCURACY: 1, MISTAKE: 1, BLUNDER: 1 }, timestamp: 100000 + index }).memory;
}
const summary = summarizeTrainingMemory(memory), roundTrip = importTrainingMemory(exportTrainingMemory(memory));
const report = { sessions: summary.overall.attempts, themes: Object.keys(summary.themes).length, duplicates: memory.sessions.length - new Set(memory.sessions.map(item => item.id)).size, newestFirst: memory.sessions.every((item, index, all) => index === 0 || all[index - 1].timestamp >= item.timestamp), masteryLevels: [...new Set(Object.values(summary.themes).map(item => item.mastery.level))], recommendation: summary.recommendation, roundTrip: roundTrip.ok && JSON.stringify(roundTrip.memory) === JSON.stringify(memory) };
console.log(JSON.stringify(report, null, 2));
if (report.sessions !== 500 || report.themes !== new Set(lessons.map(item => item.theme)).size || report.duplicates || !report.newestFirst || !report.roundTrip) process.exitCode = 1;
