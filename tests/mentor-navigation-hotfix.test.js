import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import { load } from 'cheerio';

const read = path => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

function navigation() {
  const window = {};
  const document = { querySelectorAll: () => [] };
  vm.runInNewContext(read('js/caissa-primary-navigation.js'), { window, document });
  return window.CaissaPrimaryNavigation;
}

test('Mentor is one canonical Learn & Improve destination with the approved Home copy', () => {
  const api = navigation();
  const mentorItems = Array.from(api.inventory.all).filter(item => item.id === 'mentor');
  assert.equal(mentorItems.length, 1);
  assert.equal(mentorItems[0].label, 'CAISSA Mentor');
  assert.equal(mentorItems[0].route, '/mentor');
  assert.equal(mentorItems[0].description, 'Personal coaching, game review and memory training');
  assert.deepEqual(Array.from(api.inventory.groups[1], item => item.id), [
    'puzzles', 'academy', 'mentor', 'endgame-trainer', 'endgame-library', 'endgame-tablebase'
  ]);
});

test('shared sidebar renders one active Mentor link and a Home return', () => {
  const api = navigation();
  const $ = load(`<nav>${api.adapters.modernStandalone.renderBody({ activeKey: 'mentor' })}</nav>`);
  const mentor = $('a[data-nav-key="mentor"][href="/mentor"]');
  assert.equal(mentor.length, 1);
  assert.ok(mentor.hasClass('active'));
  assert.equal(mentor.attr('aria-current'), 'page');
  assert.equal($('a[data-nav-key="home"][href="/"]').length, 1);
});

test('Mentor adopts the shared shell without a duplicate private Mentor link', () => {
  const source = read('mentor.html');
  const $ = load(source);
  assert.equal($('.caissa-standalone-layout').length, 1);
  assert.equal($('[data-caissa-standalone-sidebar][data-active="mentor"]').length, 1);
  assert.equal($('#mentor-main.caissa-standalone-content').length, 0);
  assert.equal($('.mentor-page-content.caissa-standalone-content #mentor-main').length, 1);
  assert.equal($('a[href="/mentor.html"]').length, 0);
  assert.equal($('.page-header a[href="/mentor"]').length, 0);
  assert.equal($('.sign-in').attr('href'), '/signin?redirect_url=%2Fmentor');
  assert.ok(source.indexOf('caissa-primary-navigation.js') < source.indexOf('caissa-standalone-sidebar.js'));
});

test('Home All Tools promotes described inventory items as full-width cards', () => {
  const source = read('js/home/home.js');
  const css = read('css/home/home.css');
  assert.match(source, /item\.description/);
  assert.match(source, /all-tools-card-description/);
  assert.match(css, /\.all-tools-link\.all-tools-card[^}]*grid-column:1\/-1/);
  assert.equal(load(read('home.html'))('a[href="/mentor"]').length, 0, 'Home must not hard-code a duplicate Mentor link');
});
