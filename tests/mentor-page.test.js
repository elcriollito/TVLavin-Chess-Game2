import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { Chess } from '../assets/vendor/chess.js/chess-1.4.0.esm.js';
import { LESSONS, prepareLesson } from '../js/mentor/mentor-lessons.js';
const read = path => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('all authored lessons replay as legal chess and keep FEN and SAN aligned', () => {
    for (const id of Object.keys(LESSONS)) {
        const lesson = prepareLesson(id), game = new Chess(lesson.positions[0]);
        assert.equal(lesson.positions.length, lesson.moves.length + 1);
        assert.equal(lesson.notes.length, lesson.positions.length);
        lesson.moves.forEach((move, index) => {
            assert.equal(game.move(move).san, move.san);
            assert.equal(game.fen(), lesson.positions[index + 1]);
        });
    }
});

test('knight-fork example attacks king and rook and wins the target rook legally', () => {
    const lesson = prepareLesson('fork'), game = new Chess(lesson.positions[0]);
    assert.equal(game.isCheck(), false);
    game.move('Nc7+'); assert.equal(game.isCheck(), true);
    game.move('Kd7'); assert.equal(game.move('Nxa8').captured, 'r');
});

test('dedicated Mentor study route admits its own snapshot and rejects active-play provenance', () => {
    const root = { location: { pathname: '/mentor' } };
    vm.runInNewContext(read('js/mentor/mentor-context-contract.js'), { globalThis: root });
    const contract = root.CaissaMentorContextContract;
    assert.equal(contract.resolve('/mentor').availability, 'CONTEXT');
    assert.equal(contract.resolve('/mentor.html').availability, 'CONTEXT');
    assert.equal(contract.resolve('/mentor-unknown').availability, 'NONE');
    const fen = new Chess().fen();
    assert.equal(contract.createPositionSnapshot({ source: 'mentor-study', fen }).source, 'mentor-study');
    assert.equal(contract.createPositionSnapshot({ source: 'active-play', fen }), null);
    assert.equal(contract.resolve('/play').capability, 'NONE');
});

test('page reuses shared board, rules, auth and Mentor without booting a second engine', () => {
    const html = read('mentor.html'), page = read('js/mentor/mentor-page.js');
    for (const resource of ['mentor-floating-shell.js', 'llm-provider.js', 'caissa-auth.js', 'mentor-page.js']) assert.equal(html.split(resource).length - 1, 1);
    assert.match(page, /caissa-board-adapter\.js/);
    assert.match(page, /chess-1\.4\.0\.esm\.js/);
    assert.doesNotMatch(page, /new Worker|fetch\(|innerHTML|apiKey/);
    assert.match(page, /Online import is not connected yet/);
    const shell = read('js/mentor/mentor-floating-shell.js');
    assert.match(shell, /conversation\.length > 10/);
    assert.match(shell, /> 24000/);
    assert.match(shell, /clearConversation\(\)/);
    assert.match(shell, /const history = pageMode \? conversation : \[\]/);
});
