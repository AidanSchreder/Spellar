// Tests against a real WordPress running the plugin (the PHP side). Run with a local
// WordPress Playground (see README) or any WordPress with the plugin active and a page /spellar/:
//   SPELLAR_WP_URL=http://127.0.0.1:9400 npx playwright test --project=wp
// The puzzle checks use the real clock, so they compare against the JavaScript twin of the
// PHP logic (bin/lib/puzzle.mjs) for today's dates.

import { test, expect } from '@playwright/test';
import { loadSchedule, loadWords, addDays } from '../../bin/lib/data.mjs';
import { puzzleFor, pageDays, decode, maxAgeFor, utcDate } from '../../bin/lib/puzzle.mjs';

const BASE = process.env.SPELLAR_WP_URL;
test.skip(!BASE, 'set SPELLAR_WP_URL to a WordPress with the plugin active');

const API = `${BASE}/wp-json/spellar/v1`;
const schedule = loadSchedule();
const words = loadWords();

test.describe('assets load only where the game is', () => {
  test('the game page has the root, its files, the early fetch and the font preload', async ({ request }) => {
    const html = await (await request.get(`${BASE}/spellar/`)).text();
    expect(html).toMatch(/<div class="spellar" id="spellar-root" data-api="[^"]+\/wp-json\/spellar\/v1\/" data-guesses="[^"]+data\/guesses\.txt\?ver=\d+" data-days="[^"]+"><\/div>/);
    expect(html).toContain('spellarEarly');
    expect(html).toMatch(/assets\/spellar\.css\?ver=\d+/);
    const head = html.slice(0, html.indexOf('</head>'));
    // The game's script: async, in <head>, so it starts the game as soon as it arrives.
    const tag = head.match(/<script[^>]*assets\/spellar\.js\?ver=\d+[^>]*>/);
    expect(tag && tag[0]).toMatch(/\basync\b/);
    expect(tag[0]).not.toMatch(/\bdefer\b/);
    expect(tag[0]).toContain('data-wpacu-skip'); // keeps Asset CleanUp from combining it
    // GSAP and DrawSVG: deferred, in that order, after the page.
    const gsap = html.match(/<script[^>]*assets\/vendor\/gsap\.min\.js\?ver=\d+[^>]*>/);
    const draw = html.match(/<script[^>]*assets\/vendor\/DrawSVGPlugin\.min\.js\?ver=\d+[^>]*>/);
    expect(gsap && gsap[0]).toMatch(/\bdefer\b/);
    expect(draw && draw[0]).toMatch(/\bdefer\b/);
    expect(gsap.index).toBeLessThan(draw.index);
    expect(html).toMatch(/rel="preload" href="[^"]+cormorant-garamond-600\.woff2" as="font"/);
    expect(head).toContain('<script id="spellar-dot">');
  });

  test("the page carries the puzzles for the UTC yesterday, today and tomorrow, as the puzzle route gives them", async ({ request }) => {
    const html = await (await request.get(`${BASE}/spellar/`)).text();
    const attr = html.match(/data-days="([^"]+)"/)[1].replaceAll('&quot;', '"').replaceAll('&amp;', '&');
    const days = JSON.parse(attr);
    expect(days).toEqual(pageDays({ schedule, words, nowMs: Date.now() }));
    for (const [date, body] of Object.entries(days)) {
      expect(body).toEqual(await (await request.get(`${API}/puzzle?date=${date}`)).json());
    }
  });

  test('any other page gets only the inline menu-dot script, in <head>', async ({ request }) => {
    const html = await (await request.get(`${BASE}/`)).text();
    expect(html.indexOf('<script id="spellar-dot">')).toBeLessThan(html.indexOf('</head>'));
    expect(html).not.toContain('spellar.css');
    expect(html).not.toContain('spellar.js');
    expect(html).not.toContain('gsap.min.js');
    expect(html).not.toContain('cormorant-garamond');
    expect(html).not.toContain('spellar-root');
    const dot = html.match(/<script id="spellar-dot">([\s\S]*?)<\/script>/);
    expect(dot).not.toBeNull();
    expect(Buffer.byteLength(dot[1])).toBeLessThan(1024);
  });
});

test.describe('GET /puzzle', () => {
  const today = utcDate(Date.now());

  test('matches the JavaScript twin for yesterday, today and tomorrow (UTC)', async ({ request }) => {
    for (const date of [addDays(today, -1), today, addDays(today, 1)]) {
      const res = await request.get(`${API}/puzzle?date=${date}`);
      const twin = puzzleFor({ schedule, words, date, nowMs: Date.now() });
      // 200 for every date from the launch on; 404 for a date before it (launch day's "yesterday").
      expect(res.status(), date).toBe(twin.status);
      const body = await res.json();
      if (twin.status !== 200) {
        expect(body.code).toBe(twin.body.code);
        continue;
      }
      expect(body).toEqual(twin.body);
      expect(decode(body.answer, date)).toBe(schedule.days[date]);
    }
  });

  test('cache headers: public until the date ends in UTC+14, with an Expires header', async ({ request }) => {
    const date = addDays(today, 1);
    const res = await request.get(`${API}/puzzle?date=${date}`);
    const cc = res.headers()['cache-control'];
    expect(cc).toMatch(/^public, max-age=\d+$/);
    const maxAge = Number(cc.split('=')[1]);
    expect(Math.abs(maxAge - maxAgeFor(date, Date.now()))).toBeLessThanOrEqual(5);
    expect(res.headers().expires).toMatch(/GMT$/);
    expect(res.headers()['set-cookie']).toBeUndefined();
  });

  test('rejects dates more than a day from today, and malformed input', async ({ request }) => {
    for (const q of [`date=${addDays(today, 2)}`, `date=${addDays(today, -2)}`, 'date=2026-13-01', 'date=2026-02-30',
      'date=20261018', 'date=tomorrow', 'date=', '']) {
      const res = await request.get(`${API}/puzzle?${q}`);
      expect(res.status(), q).toBe(400);
      expect(res.headers()['cache-control'] || '').toMatch(/no-store|no-cache/);
    }
  });
});

test.describe('POST /event', () => {
  const todayNumber = () => Math.round((Date.parse(utcDate(Date.now())) - Date.parse(schedule.launch)) / 864e5) + 1;
  const post = (request, data) => request.post(`${API}/event`, { data, headers: { 'Content-Type': 'application/json' } });

  test('rejects malformed events (checked before the rate limit)', async ({ request }) => {
    const n = todayNumber();
    for (const e of [
      {}, { type: 'nope' }, { type: 'start', number: n }, { type: 'finish', number: n, won: 'yes', guesses: 3 },
      { type: 'finish', number: n, won: true, guesses: 9 }, { type: 'share', number: n + 5 }, { type: 'share', number: '1' },
    ]) expect((await post(request, e)).status(), JSON.stringify(e)).toBe(400);
    expect((await request.post(`${API}/event`, { data: 'not json', headers: { 'Content-Type': 'application/json' } })).status()).toBe(400);
    expect((await request.get(`${API}/event`)).status()).toBe(404);
  });

  test('accepts valid events, at most 20 a day from one address', async ({ request }) => {
    // The allowance may already be partly used today (an earlier run): count until the first refusal.
    const n = todayNumber();
    const kinds = [
      { type: 'start', number: n, returning_d1: false, veteran: true },
      { type: 'finish', number: n, won: true, guesses: 3 },
      { type: 'finish', number: Math.max(1, n - 1), won: false, guesses: 6 }, // no puzzle #0 on launch day
      { type: 'share', number: n + 1 },
      { type: 'french_click' },
    ];
    let accepted = 0;
    let status = 200;
    for (let i = 0; i < 25 && status === 200; i++) {
      const res = await post(request, kinds[i % kinds.length]);
      status = res.status();
      if (status === 200) accepted++;
      else expect((await res.json()).code).toBe('spellar_rate_limited');
    }
    expect(status).toBe(429);
    expect(accepted).toBeLessThanOrEqual(20);
    expect((await post(request, { type: 'french_click' })).status()).toBe(429);
  });
});

test('the data folder keeps the schedule and answers private but serves the guess list', async ({ request }) => {
  // Apache honours data/.htaccess; other servers (such as Playground) do not, so this only
  // asserts when the server is Apache.
  const res = await request.get(`${BASE}/wp-content/plugins/spellar/data/schedule.json`);
  const server = res.headers().server || '';
  if (/apache/i.test(server)) {
    expect(res.status()).toBe(403);
    expect((await request.get(`${BASE}/wp-content/plugins/spellar/data/words.json`)).status()).toBe(403);
  }
  expect((await request.get(`${BASE}/wp-content/plugins/spellar/data/guesses.txt`)).status()).toBe(200);
});

test('a whole game plays through the real API', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto(`${BASE}/spellar/`);
  const local = await page.evaluate(() => {
    const d = new Date();
    const p = (n) => (n < 10 ? '0' : '') + n;
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  });
  const answer = schedule.days[local];
  await expect(page.locator('#spellar-root .sp-board')).toBeVisible();
  await page.keyboard.type(answer.toLowerCase());
  await page.keyboard.press('Enter');
  await expect(page.locator('#spellar-root .sp-answer-word')).toHaveText(answer);
  await expect(page.locator('#spellar-root .sp-fact')).toHaveText(words.find((w) => w.word === answer).fact);
});
