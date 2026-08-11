import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import { load } from 'cheerio';
import { mapChangedFileToUrl } from '../scripts/submit-indexnow.mjs';

const read=path=>fs.readFileSync(new URL(`../${path}`,import.meta.url),'utf8');

test('human approval is exact, private, unsigned and release-bounded',()=>{
  const approval=JSON.parse(read('docs/architecture/private/SEASON_10_14_LIMITED_PREVIEW_HUMAN_APPROVAL.json'));
  assert.deepEqual(approval,{
    reviewDecision:'approve-limited-preview-release',
    reviewerReference:'reviewer:alexander:season-10.14-limited-preview',reviewRevision:1,
    approvedProductName:'CAISSA Endgame Practice',approvedReleaseLabel:'Limited Preview',
    approvedReleaseMode:'limited-preview',approvedRuntimeMode:'enabled',
    approvedPublicRoute:'/endgame-practice',approvedNavigationPlacement:'primary-navigation-learning-group',
    approvedNavigationLabel:'Endgame Practice',approvedSitemapInclusion:true,
    approvedCanonical:'https://www.caissa-chess.org/endgame-practice',approvedIndexNowSubmission:true,
    approvedClarityPolicy:'public-shell-only-runtime-suppressed',approvedPersistencePolicy:'none',
    approvedAccountRequirement:'none',approvedRatingImpact:'none',
    approvedAnalyticsPolicy:'no-exercise-analytics',approvedPreviewScope:'five-reviewed-exercises-only',
    approvedRollbackPolicy:'kill-switch-first-then-normal-revert-or-known-good-deployment',
    humanApproved:true,cryptographicallySigned:false
  });
  assert.match(read('.vercelignore'),/docs\/\*\*/);
});

test('canonical navigation has Endgame Practice exactly once in the learning group',()=>{
  const window={},document={querySelectorAll:()=>[]};
  vm.runInNewContext(read('js/caissa-primary-navigation.js'),{window,document});
  const inventory=window.CaissaPrimaryNavigation.inventory;
  assert.equal(inventory.all.filter(item=>item.id==='endgame-practice').length,1);
  assert.equal(inventory.groups[1].find(item=>item.id==='endgame-practice').route,'/endgame-practice');
  const page=load(read('endgame-practice.html'));
  assert.equal(page('[data-caissa-standalone-sidebar][data-active="endgame-practice"]').length,1);
});

test('release metadata, sitemap, JSON-LD and IndexNow mapping are exact',()=>{
  const page=load(read('endgame-practice.html'));
  const canonical='https://www.caissa-chess.org/endgame-practice';
  const description='Practice five focused chess endgame ideas with guided positions, clear feedback, and no account required.';
  assert.equal(page('title').text(),'CAISSA Endgame Practice — Guided Chess Endgames');
  assert.equal(page('meta[name="description"]').attr('content'),description);
  assert.equal(page('meta[name="robots"]').attr('content'),'index, follow');
  assert.equal(page('link[rel="canonical"]').attr('href'),canonical);
  const schema=JSON.parse(page('script[type="application/ld+json"]').text());
  assert.equal(schema['@type'],'WebPage');assert.equal(schema.url,canonical);
  assert.equal((read('public/sitemap.xml').match(new RegExp(canonical,'g'))||[]).length,1);
  assert.equal(mapChangedFileToUrl('endgame-practice.html'),'/endgame-practice');
});

test('release does not add product claims, persistence, arbitrary content or private links',()=>{
  const source=read('endgame-practice.html');
  assert.doesNotMatch(source,/AI personalized|adaptive|mastery|official assessment|rated training|guaranteed improvement/i);
  assert.doesNotMatch(source,/objectiveArtifact|artifactId|fingerprint|sha256|FEN|reviewer/i);
  assert.match(source,/five carefully reviewed endgame exercises/i);
  assert.match(source,/not yet a complete endgame course/i);
});
