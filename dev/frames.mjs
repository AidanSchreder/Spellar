#!/usr/bin/env node
// Frame-by-frame review of the motion moments. Drives the real game in the harness with
// Playwright's fake clock (it also fakes requestAnimationFrame, so GSAP can be stepped exactly),
// captures frames at fixed intervals, and lays them out as contact sheets:
//   docs/screens/motion-<moment>-<size>.png
// With --video it also records each moment in real time to dev/out/recordings/.
//
//   node dev/frames.mjs [--video] [--only=pop,shake,reveal,finale,loss,title]

import { chromium } from '@playwright/test';
import { mkdirSync, readdirSync, renameSync } from 'node:fs';

// The frozen test data's server: PORT=8781 SPELLAR_DATA_DIR=tests/fixtures/data node dev/mock-api.mjs
const BASE = 'http://localhost:8781';
const OUT = 'docs/screens';
const VIDEO = process.argv.includes('--video');
const only = (process.argv.find((a) => a.startsWith('--only=')) || '').slice(7).split(',').filter(Boolean);
mkdirSync(OUT, { recursive: true });

const SIZES = { mobile: { width: 375, height: 812, dpr: 2 }, desktop: { width: 1280, height: 800, dpr: 1 } };
const WIN_DAY = '2026-11-16T15:00:00Z'; // ARTEMIS, 7 letters
const LOSS_DAY = '2026-10-22T14:00:00Z'; // CYCLE, 5 letters

async function open(browser, size, instant, { video, pauseAfter = 60_000 } = {}) {
  const ctx = await browser.newContext({
    viewport: { width: size.width, height: size.height },
    deviceScaleFactor: size.dpr,
    timezoneId: 'America/Toronto',
    ...(video ? { recordVideo: { dir: 'dev/out/recordings', size: { width: size.width, height: size.height } } } : {}),
  });
  const page = await ctx.newPage();
  await page.request.post(`${BASE}/dev/now`, { data: { now: instant } });
  await page.request.post(`${BASE}/dev/reset`);
  // The fake clock keeps running for videos (a frozen clock would also freeze GSAP) and is paused
  // below for frame stepping.
  await page.clock.install({ time: new Date(instant) });
  await page.goto(BASE);
  await page.locator('#spellar-root .sp-board').waitFor();
  await page.evaluate(() => document.fonts.ready);
  if (!video) await page.clock.pauseAt(new Date(Date.parse(instant) + pauseAfter));
  return { ctx, page };
}

async function enter(page, word) {
  await page.keyboard.type(word.toLowerCase());
  await page.keyboard.press('Enter');
}

// Steps the fake clock and screenshots `clip` at each time in `times` (ms after the action).
async function capture(page, clip, times) {
  const frames = [];
  let at = 0;
  for (const t of times) {
    if (t > at) await page.clock.runFor(t - at);
    at = t;
    frames.push({ t, png: (await page.screenshot({ clip })).toString('base64') });
  }
  return frames;
}

async function sheet(browser, name, frames, cols) {
  const page = await browser.newPage({ viewport: { width: 1600, height: 400 } });
  const cells = frames
    .map((f) => `<figure><img src="data:image/png;base64,${f.png}"><figcaption>${f.t} ms</figcaption></figure>`)
    .join('');
  await page.setContent(`<style>body{margin:0;padding:12px;font:13px sans-serif;background:#fff}
    .g{display:grid;grid-template-columns:repeat(${cols},max-content);gap:10px}
    figure{margin:0;border:1px solid #ddd}img{display:block;max-width:${Math.floor(1560 / cols) - 12}px}
    figcaption{padding:2px 6px;background:#f4f4f4}</style><div class="g">${cells}</div>`);
  await page.waitForLoadState('load');
  await page.screenshot({ path: `${OUT}/motion-${name}.png`, fullPage: true });
  await page.close();
}

const box = (page, sel) => page.locator(sel).boundingBox();
const pad = (b, p) => ({ x: Math.max(0, b.x - p), y: Math.max(0, b.y - p), width: b.width + 2 * p, height: b.height + 2 * p });

const browser = await chromium.launch();
const run = (m) => !only.length || only.includes(m);

for (const [size, dims] of Object.entries(SIZES)) {
  if (run('pop')) {
    const { ctx, page } = await open(browser, dims, WIN_DAY);
    await page.keyboard.type('pla');
    await page.clock.runFor(300);
    const t = await box(page, '#spellar-root .sp-row >> nth=0');
    await page.keyboard.type('n');
    await sheet(browser, `pop-${size}`, await capture(page, pad(t, 8), [0, 16, 33, 50, 66, 83, 100, 133]), 4);
    await ctx.close();
  }
  if (run('shake')) {
    const { ctx, page } = await open(browser, dims, WIN_DAY);
    await page.keyboard.type('qzxvkjw');
    await page.clock.runFor(300);
    const t = await box(page, '#spellar-root .sp-row >> nth=0');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(150); // the word list loads in real time
    await sheet(browser, `shake-${size}`, await capture(page, pad(t, 12), [0, 33, 66, 100, 133, 166, 200, 233, 266, 300, 333, 400]), 4);
    await ctx.close();
  }
  if (run('reveal')) {
    const { ctx, page } = await open(browser, dims, WIN_DAY);
    await page.keyboard.type('planets');
    await page.clock.runFor(300);
    const t = await box(page, '#spellar-root .sp-row >> nth=0');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(150);
    const times = [];
    for (let ms = 0; ms <= 1300; ms += 50) times.push(ms);
    await sheet(browser, `reveal-${size}`, await capture(page, pad(t, 10), times), 4);
    await ctx.close();
  }
  if (run('title')) {
    // The first swap comes 5 s after the page opens: pause just before it.
    const { ctx, page } = await open(browser, dims, WIN_DAY, { pauseAfter: 4_800 });
    const t = await box(page, '#spellar-root .sp-mark');
    const times = [];
    for (let ms = 0; ms <= 3000; ms += 100) times.push(ms);
    await sheet(browser, `title-${size}`, await capture(page, pad(t, 8), times), size === 'mobile' ? 6 : 5);
    await ctx.close();
  }
  for (const [moment, day, words] of [
    ['finale', WIN_DAY, ['PLANETS', 'STATION', 'ARTISTS', 'ARTEMIS']],
    ['loss', LOSS_DAY, ['STAMP', 'BRAND', 'NORTH', 'CLEFT', 'CYCAD', 'WHISK']],
  ]) {
    if (!run(moment)) continue;
    const { ctx, page } = await open(browser, dims, day);
    for (const w of words.slice(0, -1)) {
      await enter(page, w);
      await page.waitForTimeout(100);
      await page.clock.runFor(2000);
    }
    await page.keyboard.type(words.at(-1).toLowerCase());
    await page.clock.runFor(300);
    await page.keyboard.press('Enter');
    await page.waitForTimeout(150);
    await page.clock.runFor(1400); // the last reveal
    const b = await box(page, '#spellar-root .sp-board-wrap');
    const clip = { x: 0, y: Math.max(0, b.y - 10), width: dims.width, height: Math.min(dims.height - b.y + 10, b.height + 260) };
    const times = [];
    for (let ms = 0; ms <= 3200; ms += 200) times.push(ms);
    await sheet(browser, `${moment}-${size}`, await capture(page, clip, times), size === 'mobile' ? 6 : 4);
    await ctx.close();
  }

  if (VIDEO) {
    // Real-time recordings of a whole game: typing, a refused word, reveals and the finale.
    const { ctx, page } = await open(browser, dims, WIN_DAY, { video: true });
    await page.waitForTimeout(500);
    await page.keyboard.type('qzxvkjw', { delay: 90 });
    await page.keyboard.press('Enter');
    await page.waitForTimeout(800);
    for (let i = 0; i < 7; i++) await page.keyboard.press('Backspace');
    for (const w of ['PLANETS', 'STATION', 'ARTISTS', 'ARTEMIS']) {
      await page.keyboard.type(w.toLowerCase(), { delay: 90 });
      await page.keyboard.press('Enter');
      await page.waitForTimeout(1700);
    }
    await page.waitForTimeout(3500);
    const path = await page.video().path();
    await ctx.close();
    renameSync(path, `dev/out/recordings/game-${size}.webm`);
  }
}
await browser.close();
await fetch(`${BASE}/dev/now`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"now":null}' });
console.log('Contact sheets:', readdirSync(OUT).filter((f) => f.startsWith('motion-')).join(', '));
