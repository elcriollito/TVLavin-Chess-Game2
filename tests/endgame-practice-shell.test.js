import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read=path=>fs.readFileSync(new URL(`../${path}`,import.meta.url),'utf8');
const html=read('endgame-practice.html');

test('closed shell has exact identity, copy and five human exercises',()=>{
  for(const text of [
    'CAISSA Endgame Practice','Limited Preview','Practice five focused endgame ideas through short, guided positions.',
    '5</strong> exercises','No account required','No saved progress','Private preview',
    'Promote the Pawn','Stop the Pawn','Trade to Simplify','Hold the Draw','Activate the King',
    'Guide a passed pawn toward promotion with king support.',
    'Catch a dangerous pawn before it promotes.',
    'Use a favorable exchange to reach a clearer winning position.',
    'Preserve the draw through a safe liquidation.',
    'Bring the king forward before advancing the pawn.',
    'This preview does not save your moves, hints, results, or progress.',
    'this preview does not affect any rating.'
  ])assert.match(html,new RegExp(text.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'),'i'));
});

test('shell is undiscoverable and does not expose private source details',()=>{
  assert.match(html,/<meta name="robots" content="noindex, nofollow">/);
  assert.doesNotMatch(html,/rel="canonical"|application\/ld\+json|property="og:|fingerprint|sha256|FEN|reviewer|tablebase/i);
  assert.match(html,/data-start hidden/);
  assert.doesNotMatch(read('public/sitemap.xml'),/endgame-practice/);
  assert.doesNotMatch(read('public/robots.txt'),/endgame-practice/);
});
