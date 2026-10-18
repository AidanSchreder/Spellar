#!/usr/bin/env node
// Screenshots of every state for review: docs/screens/<size>-<state>.png
//   node dev/screens.mjs [baseURL]     (default http://localhost:8780, the mock harness)
// Uses fixed dates: 2026-10-22 (CYCLE, 5 letters) and 2026-11-16 (ARTEMIS, 7 letters).

import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';

const base = process.argv[2] || 'http://localhost:8780';
const out = 'docs/screens';
mkdirSync(out, { recursive: true });

const sizes = { mobile: { width: 375, height: 812, dpr: 2 }, desktop: { width: 1280, height: 800, dpr: 1 } };

async function open(browser, size, local, utc) {
  const ctx = await browser.newContext({
    viewport: { width: size.width, height: size.height },
    deviceScaleFactor: size.dpr,
    timezoneId: 'America/Toronto',
    reducedMotion: 'reduce',
  });
  const page = await ctx.newPage();
  await page.request.post(`${base}/dev/now`, { data: { now: utc } });
  await page.request.post(`${base}/dev/reset`);
  await page.clock.setFixedTime(new Date(utc));
  await page.goto(base);
  await page.locator('#spellar-root .sp-board').waitFor();
  await page.evaluate(() => document.fonts.ready);
  return { ctx, page };
}

async function type(page, ...words) {
  for (const w of words) {
    await page.keyboard.type(w.toLowerCase());
    await page.keyboard.press('Enter');
  }
}

const browser = await chromium.launch();
for (const [name, size] of Object.entries(sizes)) {
  const shot = (page, state, full = false) => page.screenshot({ path: `${out}/${name}-${state}.png`, fullPage: full });

  let { ctx, page } = await open(browser, size, '2026-11-16T10:00:00', '2026-11-16T15:00:00Z');
  await shot(page, 'start');
  await type(page, 'PLANETS', 'STATION');
  await page.keyboard.type('ar');
  await shot(page, 'mid');
  await page.keyboard.press('Backspace');
  await page.keyboard.press('Backspace');
  await type(page, 'ARTISTS', 'ARTEMIS');
  await page.waitForTimeout(200);
  await shot(page, 'win', true);
  await page.getByRole('button', { name: 'Stats' }).click();
  await shot(page, 'stats');
  await ctx.close();

  ({ ctx, page } = await open(browser, size, '2026-10-22T10:00:00', '2026-10-22T14:00:00Z'));
  await type(page, 'STAMP', 'BRAND', 'NORTH', 'CLEFT', 'CYCAD', 'WHISK');
  await page.waitForTimeout(200);
  await shot(page, 'loss', true);
  await ctx.close();

  ({ ctx, page } = await open(browser, size, '2026-10-22T10:00:00', '2026-10-22T14:00:00Z'));
  await page.getByRole('button', { name: 'How to play' }).click();
  await shot(page, 'help');
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Français' }).click();
  await shot(page, 'french');
  await ctx.close();
}
await browser.close();
// Give the mock server its real clock back.
await fetch(`${base}/dev/now`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"now":null}' });
console.log(`Screenshots in ${out}/`);
