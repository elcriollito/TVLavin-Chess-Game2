import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolveEndgameTrainerRoute } from '../../js/endgame-trainer/v2/endgame-trainer-route.js';

const resolve = search => resolveEndgameTrainerRoute(search).mode;
const html = await readFile(new URL('../../endgame-trainer.html', import.meta.url), 'utf8');
const sitemap = await readFile(new URL('../../public/sitemap.xml', import.meta.url), 'utf8');
const app = await readFile(new URL('../../app.js', import.meta.url), 'utf8');

test('canonical route defaults to V2 and retains the redundant exact alias', () => {
    assert.equal(resolve(''), 'public-v2');
    assert.equal(resolve('?trainerV2=1'), 'public-v2');
    assert.equal(resolve('?trainerV2=true'), 'technical-unavailable');
    assert.equal(resolve('?trainerV2=1&trainerV2=1'), 'technical-unavailable');
});

test('legacy is explicit, isolated, and conflicts fail closed', () => {
    assert.equal(resolve('?legacy=1'), 'legacy');
    for (const search of [
        '?legacy=', '?legacy=true', '?legacy=1&trainerV2=1',
        '?legacy=1&multiMovePilot=1', '?legacy=1&privateEndgameRun=five-item'
    ]) assert.equal(resolve(search), 'technical-unavailable', search);
});

test('technical routes work with or without the historical V2 alias', () => {
    const variants = [
        ['?multiMovePilot=1', 'multi-move-pilot'],
        ['?multiMovePilot=1&pilot=rule-square-a-pawn-catch-stop-promotion@1.0.0', 'multi-move-pilot'],
        ['?multiMovePilot=1&endgameRun=1', 'historical-run'],
        ['?multiMovePilot=1&objectiveArtifact=activate-king@1.0.0', 'objective-artifact'],
        ['?multiMovePilot=1&privateEndgameRun=five-item', 'private-run']
    ];
    for (const [search, mode] of variants) {
        assert.equal(resolve(search), mode);
        assert.equal(resolve(`${search}&trainerV2=1`), mode);
    }
});

test('unknown, arbitrary, duplicate, and mixed technical selectors fail closed', () => {
    for (const search of [
        '?unknown=1', '?multiMovePilot=1&pilot=arbitrary',
        '?multiMovePilot=1&objectiveArtifact=https://example.com',
        '?multiMovePilot=1&objectiveArtifact=activate-king@1.0.0&endgameRun=1',
        '?multiMovePilot=1&endgameRun=1&privateEndgameRun=five-item',
        '?multiMovePilot=1&multiMovePilot=1'
    ]) assert.equal(resolve(search), 'technical-unavailable', search);
});

test('Guided Study keeps legacy ownership and rejects mixed selectors', () => {
    assert.equal(resolve('?studyUnit=direct-opposition&release=v1'), 'guided-legacy');
    assert.equal(resolve('?trainerV2=1&studyUnit=direct-opposition&release=v1'), 'guided-legacy');
    assert.equal(resolve('?studyUnit=direct-opposition'), 'technical-unavailable');
    assert.equal(resolve('?studyUnit=direct-opposition&release=v1&legacy=1'), 'technical-unavailable');
});

test('canonical metadata, honest no-JS and explicit compatibility error are present', () => {
    assert.match(html, /<title>CAISSA Endgame Trainer[^<]*Practice Chess Endgames<\/title>/);
    assert.match(html, /<meta name="robots" content="index, follow">/);
    assert.match(html, /<link rel="canonical" href="https:\/\/www\.caissa-chess\.org\/endgame-trainer">/);
    assert.match(html, /"@type":"WebPage"/);
    assert.match(html, /requires JavaScript to load the interactive board/);
    assert.match(html, /We could not load the trainer/);
    assert.match(html, /href="\/endgame-trainer\?legacy=1">Open Compatibility View/);
});

test('sitemap contains one canonical Trainer URL and no selector URLs', () => {
    assert.equal((sitemap.match(/https:\/\/www\.caissa-chess\.org\/endgame-trainer/g) || []).length, 1);
    assert.doesNotMatch(sitemap, /trainerV2|legacy=|multiMovePilot|privateEndgameRun/);
});

test('historical section aliases canonicalize once without affecting other sections', () => {
    assert.match(app, /\['endgameTrainer', 'endgame'\]\.includes/);
    assert.match(app, /urlParams\.size === 1/);
    assert.match(app, /window\.location\.replace\('\/endgame-trainer'\)/);
});
