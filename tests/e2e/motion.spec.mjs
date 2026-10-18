import { test, expect } from '@playwright/test';
import { TZ, openOn, typeWord, tile } from './helpers.mjs';

// Full motion here (the default), unlike game.spec.mjs.
test.use({ timezoneId: TZ });

const DAY = '2026-11-16'; // ARTEMIS, 7 letters, 7 rows
const finished = (page) => expect(page.locator('#spellar-root')).toHaveClass(/is-sky/, { timeout: 10_000 });

// Every star's centre against the centre of the tile it belongs to, and every hairline's ends
// against the centres of the stars it joins. Returns the worst error in px.
async function alignmentError(page) {
  return page.evaluate(() => {
    const wrap = document.querySelector('#spellar-root .sp-board-wrap').getBoundingClientRect();
    const rows = [...document.querySelectorAll('#spellar-root .sp-row')];
    const svg = document.querySelector('#spellar-root .sp-sky');
    const nodes = [...svg.querySelectorAll('.sp-stars > g')];
    const lines = [...svg.querySelectorAll('.sp-line')];
    let worst = 0;
    const centres = nodes.map((g) => {
      const r = g.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    });
    // Star i belongs to column i, on the first row that column was correct (or the last row).
    centres.forEach((c, col) => {
      let best = Infinity;
      for (const row of rows) {
        const t = row.children[col].getBoundingClientRect();
        best = Math.min(best, Math.hypot(t.left + t.width / 2 - c.x, t.top + t.height / 2 - c.y));
      }
      worst = Math.max(worst, best);
    });
    for (const line of lines) {
      const x1 = +line.getAttribute('x1') + wrap.left;
      const y1 = +line.getAttribute('y1') + wrap.top;
      const x2 = +line.getAttribute('x2') + wrap.left;
      const y2 = +line.getAttribute('y2') + wrap.top;
      const nearest = (x, y) => Math.min(...centres.map((c) => Math.hypot(c.x - x, c.y - y)));
      worst = Math.max(worst, nearest(x1, y1), nearest(x2, y2));
    }
    return { worst, stars: nodes.length, lines: lines.length };
  });
}

for (const [w, h] of [[375, 812], [1280, 800]]) {
  test(`the constellation lines up with the tiles at ${w}px, also after a resize`, async ({ page }) => {
    await page.setViewportSize({ width: w, height: h });
    await openOn(page, `${DAY}T10:00:00`);
    for (const word of ['PLANETS', 'STATION', 'ARTISTS', 'ARTEMIS']) await typeWord(page, word);
    await finished(page);
    let a = await alignmentError(page);
    expect(a.stars).toBe(7);
    expect(a.lines).toBe(6);
    expect(a.worst).toBeLessThan(0.75);

    await page.setViewportSize({ width: w === 375 ? 340 : 900, height: h - 100 });
    await page.waitForTimeout(150);
    a = await alignmentError(page);
    expect(a.worst).toBeLessThan(0.75);

    // And after coming back from the reviewed (full-strength) board.
    await page.locator('.sp-board-wrap').click();
    await page.locator('.sp-board-wrap').click();
    await page.setViewportSize({ width: w, height: h });
    await page.waitForTimeout(150);
    expect((await alignmentError(page)).worst).toBeLessThan(0.75);
  });
}

test('the reveal stamps each tile with a star; input is locked and keys change only after it', async ({ page }) => {
  await openOn(page, `${DAY}T10:00:00`);
  await page.keyboard.type('planets');
  await page.keyboard.press('Enter');
  // A cover in the tile's new state, clipped to a star, grows over the tile.
  const cover = page.locator('#spellar-root .sp-cover').first();
  await expect(cover).toBeAttached();
  expect(await cover.evaluate((c) => getComputedStyle(c).clipPath)).toMatch(/^polygon\((?:[^,]+,){9}[^,]+\)$/); // 10 corners
  expect(await cover.getAttribute('aria-hidden')).toBe('true');
  await page.keyboard.type('x'); // ignored while the row is revealed
  expect(await page.locator('.sp-key[data-key="P"]').getAttribute('data-state')).toBeNull();
  await expect(page.locator('.sp-key[data-key="P"]')).toHaveAttribute('data-state', 'absent');
  await expect(tile(page, 1, 0)).toHaveAttribute('data-state', 'empty');
  await expect(page.locator('#spellar-root .sp-cover')).toHaveCount(0);
  // The tiles themselves end in their states (PLANETS against ARTEMIS).
  const states = await page.locator('#spellar-root .sp-row').first().locator('.sp-tile').evaluateAll((t) => t.map((x) => x.dataset.state));
  expect(states).toEqual(['absent', 'absent', 'present', 'absent', 'present', 'present', 'correct']);
});

test('the title now and then turns from Spellar to Stellar and back', async ({ page }) => {
  await openOn(page, `${DAY}T10:00:00`);
  await page.clock.pauseAt(new Date(`${DAY}T10:00:01-04:00`));
  const look = () => page.evaluate(() => {
    const q = (s) => getComputedStyle(document.querySelector(`#spellar-root ${s}`));
    return { p: Number(q('.sp-p').opacity), t: Number(q('.sp-t').opacity), tVisible: q('.sp-t').visibility };
  });
  expect(await look()).toEqual({ p: 1, t: 0, tVisible: 'hidden' });
  await page.clock.runFor(5_500); // the first swap starts 5 s after the page opens
  const swapped = await look();
  expect(swapped.p).toBeLessThan(0.05);
  expect(swapped.t).toBeGreaterThan(0.95);
  await expect(page.locator('#spellar-root h1')).toHaveAttribute('aria-label', 'SEDS Spellar'); // read as Spellar throughout
  await page.clock.runFor(2_500);
  expect(await look()).toEqual({ p: 1, t: 0, tVisible: 'hidden' });
  expect(await page.locator('#spellar-root .sp-pt').evaluate((s) => s.style.width)).toBe('');
});

test('a tap during the end sequence skips straight to its end state', async ({ page }) => {
  await openOn(page, `${DAY}T10:00:00`);
  await page.keyboard.type('artemis');
  await page.keyboard.press('Enter');
  // Wait for the reveal to finish, then tap as soon as the sequence has started.
  await expect(page.locator('#spellar-root .sp-end')).toBeAttached({ timeout: 5000 });
  const started = Date.now();
  await page.mouse.click(5, 5);
  await finished(page);
  expect(Date.now() - started).toBeLessThan(1000); // well short of the ~2.5 s sequence
  await expect(page.locator('#spellar-root .sp-answer')).toBeVisible();
  await expect(page.locator('#spellar-root .sp-results')).toBeVisible();
  const opacity = await page.locator('#spellar-root .sp-board').evaluate((b) => getComputedStyle(b).opacity);
  expect(Number(opacity)).toBeCloseTo(0.14, 2);
});

test.describe('reduced motion', () => {
  test.use({ reducedMotion: 'reduce' });

  test('no tweens: states change instantly and the constellation appears fully drawn', async ({ page }) => {
    await openOn(page, `${DAY}T10:00:00`);
    await page.keyboard.type('planets');
    await page.keyboard.press('Enter');
    // No star, and the row is scored at once.
    await expect(tile(page, 0, 6)).toHaveAttribute('data-state', 'correct', { timeout: 300 });
    await expect(page.locator('#spellar-root .sp-cover')).toHaveCount(0);
    await page.keyboard.type('artemis');
    await page.keyboard.press('Enter');
    await expect(page.locator('#spellar-root')).toHaveClass(/is-sky/, { timeout: 300 });
    const state = await page.evaluate(() => ({
      transforms: [...document.querySelectorAll('#spellar-root .sp-star-body')].map((g) => g.getAttribute('transform')),
      dash: [...document.querySelectorAll('#spellar-root .sp-line')].map((l) => l.style.strokeDasharray),
      label: getComputedStyle(document.querySelector('#spellar-root .sp-answer')).opacity,
    }));
    expect(state.transforms.every((t) => t === null)).toBe(true); // never scaled
    expect(state.dash.every((d) => d === '')).toBe(true); // never dashed: drawn in full
    expect(state.label).toBe('1');
  });

  test('the title always reads Spellar', async ({ page }) => {
    await openOn(page, `${DAY}T10:00:00`);
    await page.clock.runFor(120_000);
    expect(await page.locator('#spellar-root .sp-t').evaluate((t) => getComputedStyle(t).visibility)).toBe('hidden');
  });

  test('an invalid guess still shows the toast, without the shake', async ({ page }) => {
    await openOn(page, `${DAY}T10:00:00`);
    await page.keyboard.type('qzxvkjw');
    await page.keyboard.press('Enter');
    await expect(page.locator('.sp-toast')).toHaveText('Not in word list');
    expect(await page.locator('#spellar-root .sp-row').first().evaluate((r) => r.style.transform)).toBe('');
  });
});
