// Shared set-up for the browser tests: pin the server's and the browser's clocks to the same
// moment, and look up that day's answer from data/schedule.json.

import { expect } from '@playwright/test';
import { loadSchedule } from '../../bin/lib/data.mjs';

export const TZ = 'America/Toronto';
const schedule = loadSchedule();

export const answerOn = (date) => schedule.days[date];

// local: "2026-10-22T10:00:00" in Toronto time; utc: the same instant.
export async function openOn(page, local, { utc, reset = true, path = '/' } = {}) {
  const instant = utc || new Date(`${local}-04:00`).toISOString();
  await page.request.post('/dev/now', { data: { now: instant } });
  if (reset) await page.request.post('/dev/reset');
  // A fake clock that keeps running from that moment (a frozen one would stop GSAP's animations).
  await page.clock.install({ time: new Date(instant) });
  await page.goto(path);
  await expect(page.locator('#spellar-root .sp-board, #spellar-root .sp-error')).toBeVisible();
}

export async function typeWord(page, word) {
  await page.keyboard.type(word.toLowerCase());
  await page.keyboard.press('Enter');
  // Input is locked while a row is revealed (the board is aria-busy): wait for it to finish.
  await page.waitForTimeout(30);
  await expect(page.locator('#spellar-root .sp-board[aria-busy]')).toHaveCount(0, { timeout: 5000 });
}

export async function stats(page) {
  return (await page.request.get('/dev/stats')).json();
}

export const row = (page, r) => page.locator('#spellar-root .sp-row').nth(r);
export const tile = (page, r, c) => row(page, r).locator('.sp-tile').nth(c);
