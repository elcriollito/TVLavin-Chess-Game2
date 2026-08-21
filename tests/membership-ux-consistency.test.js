import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (file) => fs.readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');

test('shared auth presentation distinguishes anonymous, Free, and authoritative paid tiers', () => {
  const ui = read('js/caissa-ui-auth.js');
  const access = read('js/caissa-access.js');
  assert.match(ui, /href = '\/signup'/);
  assert.match(ui, /Create Account/);
  for (const tier of ['Free', 'Silver', 'Gold', 'Platinum']) assert.match(ui, new RegExp(tier));
  assert.match(ui, /getMembershipTier/);
  assert.match(access, /membershipTier: data\.membershipTier \?\? null/);
  assert.doesNotMatch(ui, /const tier = isPremium \? 'Premium' : 'Free'/);
});

test('Endgame Trainer adopts shared auth and canonical gold Premium treatment', () => {
  const html = read('endgame-trainer.html');
  const css = read('css/endgame-trainer.css');
  for (const token of ['sidebarAuthArea', 'sidebarUserInfo', 'sidebarUserTier', 'caissa-ui-auth.js']) assert.match(html, new RegExp(token));
  assert.match(css, /--caissa-premium-start/);
  const premiumRule = css.match(/\.endgame-trainer-page__premium[^\n]+/)?.[0] || '';
  assert.doesNotMatch(premiumRule, /#8058df/);
});

test('Pricing inventory is honest about Free, credits, and future tiers', () => {
  const pricing = read('js/caissa-pricing-inventory.js');
  for (const token of ['Live Free', 'Credit-Based', 'Coming Soon', 'Shared CAISSA Mentor', 'account credits apply']) assert.match(pricing, new RegExp(token));
  assert.doesNotMatch(pricing, /Unlimited Mentor|5\/day/);
  assert.match(read('premium.html'), /Registration is free/);
});

test('registration retains the single server-authoritative provisioning path', () => {
  const signup = read('js/signup-page.js');
  const completion = read('js/auth-complete.js');
  const sync = read('api/user/sync.js');
  assert.match(signup, /afterSignUpUrl: getCompletionUrl\(\)/);
  assert.match(completion, /fetch\('\/api\/user\/sync'/);
  assert.match(sync, /onConflict: 'clerk_id'/);
});

test('every standalone sidebar obtains the same auth runtime from its shared renderer', () => {
  const renderer = read('js/caissa-standalone-sidebar.js');
  const runtime = read('js/caissa-standalone-auth-runtime.js');
  assert.match(renderer, /caissa-standalone-auth-runtime\.js/);
  for (const asset of ['auth-config.js', 'caissa-auth.js', 'caissa-access.js', 'caissa-ui-auth.js']) assert.match(runtime, new RegExp(asset));
  assert.match(runtime, /data-caissa-auth-runtime/);
});
