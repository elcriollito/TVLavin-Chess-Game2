import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read=path=>fs.readFileSync(new URL(`../${path}`,import.meta.url),'utf8');
const html=read('endgame-practice.html');

test('released shell has exact identity, copy and five human exercises',()=>{
  for(const text of [
    'CAISSA Endgame Practice','Limited Preview','Practice five focused endgame ideas through short, guided positions with clear feedback.',
    '5</strong> reviewed exercises','No account required','No rating impact','No saved progress',
    'Promote the Pawn','Stop the Pawn','Trade to Simplify','Hold the Draw','Activate the King',
    'Guide a passed pawn toward promotion with king support.',
    'Catch a dangerous pawn before it promotes.',
    'Use a favorable exchange to reach a clearer winning position.',
    'Preserve the draw through a safe liquidation.',
    'Bring the king forward before advancing the pawn.',
    'Your moves, hints, results, and progress are not saved.','Exercise analytics are disabled.',
    'This is a small preview, not a complete training course.','Share Feedback'
  ])assert.match(html,new RegExp(text.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'),'i'));
});

test('shell has exact honest discovery metadata and exposes no private source details',()=>{
  assert.match(html,/<meta name="robots" content="index, follow">/);
  assert.match(html,/rel="canonical" href="https:\/\/www\.caissa-chess\.org\/endgame-practice"/);
  assert.match(html,/CAISSA Endgame Practice — Guided Chess Endgames/);
  assert.match(html,/type="application\/ld\+json"/);
  assert.doesNotMatch(html,/fingerprint|sha256|FEN|reviewer|tablebase/i);
  assert.match(html,/data-start hidden/);
  assert.equal((read('public/sitemap.xml').match(/https:\/\/www\.caissa-chess\.org\/endgame-practice/g)||[]).length,1);
  assert.doesNotMatch(read('public/robots.txt'),/endgame-practice/);
});
