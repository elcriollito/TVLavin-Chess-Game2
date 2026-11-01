import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8');

test('signup exposes the reviewed Clerk surface behind a server-hydrated gate', () => {
  const html = read('signup.html');
  const signup = read('js/signup-page.js');
  assert.match(html, /id="registration-unavailable"[^>]*hidden/);
  assert.match(html, /id="clerk-sign-up"[^>]*hidden/);
  assert.match(html, /clerk-auth-page-loader\.js/);
  assert.match(html, /signup-page\.js/);
  assert.match(signup, /REGISTRATION_OPEN !== true/);
  assert.match(signup, /CAISSA_CLERK_PAGE_LOADER\.load/);
  assert.match(signup, /mountSignUp/);
  assert.match(signup, /transferable:\s*false/);
  assert.match(html, /href="\/signin"/);
});

test('Home and Sign In expose Create account only when the backend gate is open', () => {
  const home = read('home.html');
  const signin = read('signin.html');
  const homeJs = read('js/home/home.js');
  assert.doesNotMatch(home, /home-registration-notice-title|registration-paused\.css/);
  assert.doesNotMatch(signin, /registration temporarily paused/i);
  assert.match(signin, /id="clerk-sign-in"/);
  assert.match(signin, /id="signin-registration-link" hidden/);
  assert.match(signin, /signin-page\.js/);
  const signinClient = read('js/signin-page.js');
  assert.match(signinClient, /transferable:\s*false/);
  assert.match(signinClient, /withSignUp:\s*config\.REGISTRATION_OPEN === true/);
  assert.match(homeJs, /REGISTRATION_OPEN === true/);
  assert.match(homeJs, /authHref\('signup'\)/);
  assert.match(homeJs, /authHref\('signin'\)/);
});

test('routes stay intact, signup responses are uncached, reset is not falsely announced', () => {
  const config = JSON.parse(read('vercel.json'));
  assert.ok(config.rewrites.some(route => route.source === '/signup' && route.destination === '/signup.html'));
  assert.ok(config.rewrites.some(route => route.source === '/signin' && route.destination === '/signin.html'));
  assert.ok(config.headers.some(item => item.source === '/signup' && item.headers.some(h => h.key === 'Cache-Control' && h.value.includes('no-store'))));
  assert.doesNotMatch(read('home.html') + read('signup.html'), /previous profiles have been reset|perfiles anteriores fueron reiniciados/i);
});
