import { test, expect } from '@playwright/test';
import { TZ, answerOn, openOn, typeWord, stats, row, tile } from './helpers.mjs';

test.use({ timezoneId: TZ, reducedMotion: 'reduce' });

const DAY = '2026-10-22'; // CYCLE: 5 letters, 6 guesses
const ANSWER = answerOn(DAY);
const WRONG = ['STAMP', 'BRAND', 'NORTH', 'WHISK', 'PLANK', 'FROZE'];

test.beforeEach(async ({ page }) => {
  await openOn(page, `${DAY}T10:00:00`);
});

test('renders the page parts in order, with the tagline verbatim', async ({ page }) => {
  expect(ANSWER).toBe('CYCLE');
  const root = page.locator('#spellar-root');
  await expect(root.locator('h1')).toHaveAttribute('aria-label', 'SEDS Spellar');
  await expect(root.locator('.sp-tagline')).toHaveText('includes ships, space related stuff, astronomy, and more!');
  await expect(root.locator('.sp-row')).toHaveCount(6);
  await expect(row(page, 0).locator('.sp-tile')).toHaveCount(5);
  await expect(root.locator('.sp-legend')).toHaveText(/Right spot\s*·\s*Wrong spot\s*·\s*Not in word/);
  await expect(root.locator('.sp-key')).toHaveCount(28);
  await expect(root.locator('.sp-foot button')).toHaveText(['How to play', 'Stats', 'Français']);
  // How to play never opens by itself.
  await expect(root.locator('dialog[open]')).toHaveCount(0);
  const order = await root.evaluate((el) => [...el.querySelectorAll('.sp-head, .sp-board-wrap, .sp-legend, .sp-keys, .sp-foot')].map((n) => n.className));
  expect(order).toEqual(['sp-head', 'sp-board-wrap', 'sp-legend', 'sp-keys', 'sp-foot']);
});

test('typing, deleting and the on-screen keyboard', async ({ page }) => {
  await page.keyboard.type('sta');
  await expect(tile(page, 0, 2)).toHaveAttribute('aria-label', 'A');
  await expect(tile(page, 0, 2)).toHaveAttribute('data-state', 'tbd');
  await page.keyboard.press('Backspace');
  await expect(tile(page, 0, 2)).toHaveAttribute('data-state', 'empty');
  await page.locator('.sp-key[data-key="M"]').click();
  await page.locator('.sp-key[data-key="P"]').click();
  await page.locator('.sp-key[data-key="Backspace"]').click();
  await page.keyboard.type('px');
  // Five letters typed; a sixth is ignored.
  await page.keyboard.type('q');
  await expect(row(page, 0)).toHaveAttribute('aria-label', 'Guess 1 of 6');
  await expect(row(page, 0).locator('.sp-l')).toHaveText(['S', 'T', 'M', 'P', 'X']);
});

test('invalid guesses shake, toast, and never use up a row', async ({ page }) => {
  await typeWord(page, 'CYC');
  await expect(page.locator('.sp-toast')).toHaveText('Not enough letters');
  await expect(page.locator('#spellar-root [role="status"]')).toHaveText('Not enough letters');
  for (let i = 0; i < 3; i++) await page.keyboard.press('Backspace');
  await typeWord(page, 'XQZVK');
  await expect(page.locator('.sp-toast')).toHaveText('Not in word list');
  await expect(tile(page, 0, 0)).toHaveAttribute('data-state', 'tbd');
  await expect(tile(page, 1, 0)).toHaveAttribute('data-state', 'empty');
});

test('scoring, keyboard colours and screen-reader labels', async ({ page }) => {
  await typeWord(page, 'CLEAR'); // C correct, L present, E present, A absent, R absent
  const states = await row(page, 0).locator('.sp-tile').evaluateAll((t) => t.map((x) => x.dataset.state));
  expect(states).toEqual(['correct', 'present', 'present', 'absent', 'absent']);
  await expect(tile(page, 0, 0)).toHaveAttribute('aria-label', 'C, correct');
  await expect(tile(page, 0, 1)).toHaveAttribute('aria-label', 'L, wrong spot');
  await expect(tile(page, 0, 3)).toHaveAttribute('aria-label', 'A, not in word');
  await expect(page.locator('.sp-key[data-key="C"]')).toHaveAttribute('data-state', 'correct');
  await expect(page.locator('.sp-key[data-key="A"]')).toHaveAttribute('aria-label', 'A, not in word');
  await expect(page.locator('#spellar-root [role="status"]')).toHaveText(
    'Guess 1 of 6: C correct, L wrong spot, E wrong spot, A not in word, R not in word.',
  );
});

test('winning shows the constellation, answer, fact, stats, share and countdown', async ({ page }) => {
  await typeWord(page, 'CLEAR');
  await typeWord(page, ANSWER);
  const root = page.locator('#spellar-root');
  await expect(root).toHaveClass(/is-sky/);
  await expect(root.locator('.sp-keys')).toHaveCount(0);
  await expect(root.locator('.sp-answer-word')).toHaveText(ANSWER);
  await expect(root.locator('.sp-fact')).toContainText('11 years');
  await expect(root.locator('.sp-star')).toHaveCount(5);
  await expect(root.locator('.sp-line')).toHaveCount(4);
  const nums = await root.locator('.sp-end .sp-num-v').allTextContents();
  expect(nums).toEqual(['1', '100', '1', '1']);
  await expect(root.locator('.sp-end .sp-bar-row.is-today .sp-bar-n')).toHaveText('2');
  await expect(root.locator('.sp-share')).toHaveText('Share');
  await expect(root.locator('.sp-next')).toHaveText('Next Spellar in 14h 0m');

  // Tapping the constellation shows the guesses at full strength, and back.
  await root.locator('.sp-board-wrap').click();
  await expect(root).toHaveClass(/is-review/);
  await root.locator('.sp-board-wrap').click();
  await expect(root).not.toHaveClass(/is-review/);
});

test('losing leaves rings where letters were never found', async ({ page }) => {
  for (const w of WRONG) await typeWord(page, w);
  const root = page.locator('#spellar-root');
  await expect(root).toHaveClass(/is-sky/);
  await expect(root.locator('.sp-answer-word')).toHaveText(ANSWER);
  // FROZE found the E in place; the other four letters were never found.
  await expect(root.locator('.sp-ring')).toHaveCount(4);
  await expect(root.locator('.sp-star')).toHaveCount(1);
  await expect(root.locator('.sp-line')).toHaveCount(0);
  const nums = await root.locator('.sp-end .sp-num-v').allTextContents();
  expect(nums).toEqual(['1', '0', '0', '0']);
});

test('a finished game comes back finished, with no replay', async ({ page }) => {
  await typeWord(page, ANSWER);
  await expect(page.locator('#spellar-root')).toHaveClass(/is-sky/);
  await page.reload();
  const root = page.locator('#spellar-root');
  await expect(root).toHaveClass(/is-done/);
  await expect(root).toHaveClass(/is-sky/);
  await expect(root.locator('.sp-keys')).toHaveCount(0);
  await expect(root.locator('.sp-answer-word')).toHaveText(ANSWER);
  // Stats are not counted twice.
  expect(await root.locator('.sp-end .sp-num-v').first().textContent()).toBe('1');
});

test('a game in progress survives a reload', async ({ page }) => {
  await typeWord(page, 'CLEAR');
  await page.keyboard.type('ab');
  await page.reload();
  await expect(tile(page, 0, 0)).toHaveAttribute('aria-label', 'C, correct');
  await expect(tile(page, 1, 0)).toHaveAttribute('data-state', 'empty');
  await expect(page.locator('.sp-key[data-key="C"]')).toHaveAttribute('data-state', 'correct');
});

test('analytics: start, finish and share are sent once per day', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await typeWord(page, 'CLEAR');
  await typeWord(page, ANSWER);
  await page.locator('.sp-share').click();
  await page.locator('.sp-share').click();
  await expect.poll(async () => (await stats(page))[DAY]).toEqual({
    starts: 1, finishes: 1, wins: 1, guesses_2: 1, shares: 1,
  });
  await page.reload();
  await page.locator('.sp-share').click();
  await page.waitForTimeout(300);
  expect((await stats(page))[DAY].shares).toBe(1);
});

test('sharing copies star text without the answer', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await typeWord(page, 'CLEAR');
  await typeWord(page, ANSWER);
  await page.locator('.sp-share').click();
  await expect(page.locator('.sp-toast')).toHaveText('Copied');
  // (Windows' clipboard hands lines back with CRLF endings.)
  const text = (await page.evaluate(() => navigator.clipboard.readText())).replace(/\r\n/g, '\n');
  expect(text).toBe('Spellar #6 2/6\n★✦✦··\n★★★★★\nseds.ca/spellar');
  expect(text).not.toContain(ANSWER);
});

test('the Français button explains, and is counted once a day', async ({ page }) => {
  await page.getByRole('button', { name: 'Français' }).click();
  const dialog = page.locator('dialog[open]');
  await expect(dialog).toContainText('Une version française est en préparation.');
  await expect(dialog).toContainText('A French version is in the works.');
  await dialog.getByRole('button', { name: 'Close' }).click();
  await expect(page.locator('dialog[open]')).toHaveCount(0);
  await page.getByRole('button', { name: 'Français' }).click();
  await page.keyboard.press('Escape');
  await expect.poll(async () => (await stats(page))[DAY]).toEqual({ french_clicks: 1 });
});

test('How to play and Stats open as dialogs, and typing does not leak into the board', async ({ page }) => {
  await page.getByRole('button', { name: 'How to play' }).click();
  await expect(page.locator('dialog[open] h2')).toHaveText('How to play');
  await page.keyboard.type('abc');
  await page.keyboard.press('Escape');
  await expect(tile(page, 0, 0)).toHaveAttribute('data-state', 'empty');
  await page.getByRole('button', { name: 'Stats' }).click();
  await expect(page.locator('dialog[open] .sp-num-k')).toHaveText(['Played', 'Win %', 'Streak', 'Max streak']);
});

test('the whole game can be played with a keyboard alone', async ({ page }) => {
  // Tab to an on-screen key and press it with Enter: it types that letter, not a submission.
  await page.locator('.sp-key[data-key="C"]').focus();
  await page.keyboard.press('Enter');
  await expect(tile(page, 0, 0)).toHaveAttribute('aria-label', 'C');
  await expect(page.locator('.sp-key[data-key="C"]')).toBeFocused();
  // Focus moved off the keys: the physical keyboard does the rest.
  await page.evaluate(() => document.activeElement.blur());
  await page.keyboard.type('ycle');
  await page.keyboard.press('Enter');
  await expect(page.locator('#spellar-root')).toHaveClass(/is-sky/);
  // The finished board toggles with Enter or Space.
  await page.locator('.sp-board-wrap').focus();
  await page.keyboard.press('Space');
  await expect(page.locator('#spellar-root')).toHaveClass(/is-review/);
});

test('a mouse click on a key does not leave it to catch the Enter key', async ({ page }) => {
  for (const k of 'CYCL') await page.keyboard.type(k.toLowerCase());
  await page.locator('.sp-key[data-key="E"]').click();
  await page.keyboard.press('Enter'); // must submit, not type another E
  await expect(page.locator('#spellar-root')).toHaveClass(/is-sky/);
});

test('works when storage is blocked (private mode)', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, 'localStorage', { get() { throw new Error('SecurityError'); } });
  });
  await openOn(page, `${DAY}T10:00:00`);
  await typeWord(page, ANSWER);
  await expect(page.locator('#spellar-root .sp-answer-word')).toHaveText(ANSWER);
});

test('no cookies are set', async ({ page, context }) => {
  await typeWord(page, ANSWER);
  expect(await context.cookies()).toEqual([]);
});

test('the menu dot state is written: visit on load, played on finish', async ({ page }) => {
  const dot = () => page.evaluate(() => JSON.parse(localStorage.getItem('spellar:dot')));
  expect(await dot()).toEqual({ firstVisit: DAY });
  await typeWord(page, ANSWER);
  expect(await dot()).toEqual({ firstVisit: DAY, lastPlayed: DAY });
});

test('a finished page moves on to the next puzzle at midnight, and a stale tab on return', async ({ page }) => {
  // Finish the game at 23:59:30 with the clock paused, then let it run past midnight.
  await openOn(page, `${DAY}T23:58:00`);
  await page.clock.pauseAt(new Date(`${DAY}T23:59:30-04:00`));
  await typeWord(page, ANSWER);
  await expect(page.locator('#spellar-root')).toHaveClass(/is-done/);
  await page.clock.runFor(60_000);
  await expect(page.locator('#spellar-root')).not.toHaveClass(/is-done/, { timeout: 10_000 });
  await expect(page.locator('#spellar-root .sp-board')).toBeVisible();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('spellar:v1')).puzzle.date)).toBe('2026-10-23');
});
