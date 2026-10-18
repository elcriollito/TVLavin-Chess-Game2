import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8');

test('signup is a static bilingual pause page and cannot mount Clerk signup', () => {
  const html = read('signup.html');
  assert.match(html, /id="registration-paused-title"/);
  assert.match(html, /lang="es"/);
  assert.match(html, /lang="en"/);
  assert.match(html, /registrations are temporarily paused/i);
  assert.doesNotMatch(html, /id="clerk-sign-up"|signup-page\.js|mountSignUp/i);
  assert.match(html, /href="\/signin"/);
});

test('home and sign in explain pause while leaving sign in and chess tools available', () => {
  const home = read('home.html');
  const signin = read('signin.html');
  const homeJs = read('js/home/home.js');
  assert.match(home, /id="home-registration-notice-title"/);
  assert.match(home, /registration-paused\.css/);
  assert.match(signin, /registration temporarily paused/i);
  assert.match(signin, /id="clerk-sign-in"/);
  assert.match(signin, /signin-page\.js/);
  const signinClient = read('js/signin-page.js');
  assert.match(signinClient, /transferable:\s*false/);
  assert.match(signinClient, /withSignUp:\s*false/);
  assert.doesNotMatch(homeJs, /authHref\('signup'\)/);
  assert.match(homeJs, /authHref\('signin'\)/);
  assert.match(read('css/registration-paused.css'), /max-width:720px/);
});

test('routes stay intact, signup responses are uncached, reset is not falsely announced', () => {
  const config = JSON.parse(read('vercel.json'));
  assert.ok(config.rewrites.some(route => route.source === '/signup' && route.destination === '/signup.html'));
  assert.ok(config.rewrites.some(route => route.source === '/signin' && route.destination === '/signin.html'));
  assert.ok(config.headers.some(item => item.source === '/signup' && item.headers.some(h => h.key === 'Cache-Control' && h.value.includes('no-store'))));
  assert.doesNotMatch(read('home.html') + read('signup.html'), /previous profiles have been reset|perfiles anteriores fueron reiniciados/i);
});
