// How long the live game takes to appear for a first-time visitor, and where the time goes.
//   node dev/perf.mjs [https://www.seds.ca/spellar/] [--phone] [--runs N]
// --phone emulates a mid-range phone (390x844, 4x CPU slowdown, ~9 Mbit/s, 150 ms latency).
// Analytics posts are intercepted, so nothing is counted. Run it sparingly: each run is one
// page view plus one puzzle request on the live host.

import { chromium, devices } from '@playwright/test';

const args = process.argv.slice(2);
const url = args.find((a) => a.startsWith('http')) || 'https://www.seds.ca/spellar/';
const phone = args.includes('--phone');
const runs = Number((args[args.indexOf('--runs') + 1] || '').match(/^\d+$/) ? args[args.indexOf('--runs') + 1] : 1);

const browser = await chromium.launch();
for (let run = 0; run < runs; run++) {
  const context = await browser.newContext(phone ? { ...devices['Pixel 7'] } : { viewport: { width: 1366, height: 900 } });
  await context.route('**/wp-json/spellar/v1/event', (route) => route.fulfill({ status: 200, body: '{}' }));
  const page = await context.newPage();
  if (phone) {
    const cdp = await context.newCDPSession(page);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
    await cdp.send('Network.enable');
    await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 150, downloadThroughput: 9e6 / 8, uploadThroughput: 3e6 / 8 });
  }
  // Watch, from the first byte, for the moments that matter: menu item, dot, board, filled board.
  await page.addInitScript(() => {
    const marks = (window.__marks = {});
    const mark = (k) => marks[k] === undefined && (marks[k] = Math.round(performance.now()));
    new MutationObserver(() => {
      if (document.querySelector('.spellar-menu-item')) mark('menuItem');
      if (document.querySelector('.spellar-dot')) mark('menuDot');
      if (document.querySelector('#spellar-root .sp-head')) mark('gameScriptRan');
      if (document.querySelector('#spellar-root .sp-board')) mark('board');
    }).observe(document, { childList: true, subtree: true });
    document.addEventListener('DOMContentLoaded', () => mark('domContentLoaded'));
    window.addEventListener('load', () => mark('load'));
  });
  const t0 = Date.now();
  await page.goto(url, { waitUntil: 'load', timeout: 90000 });
  await page.locator('#spellar-root .sp-board').waitFor({ timeout: 60000 });
  await page.waitForTimeout(500);
  const result = await page.evaluate(() => {
    const nav = performance.getEntriesByType('navigation')[0];
    const res = performance.getEntriesByType('resource');
    const pick = (re) => res.filter((r) => re.test(r.name)).map((r) => ({
      name: r.name.replace(/^https?:\/\/[^/]+/, '').slice(0, 90),
      start: Math.round(r.startTime), end: Math.round(r.responseEnd), kb: Math.round(r.transferSize / 1024),
    }));
    return {
      ttfb: Math.round(nav.responseStart),
      htmlDone: Math.round(nav.responseEnd),
      marks: window.__marks,
      requests: res.length,
      kb: Math.round(res.reduce((a, r) => a + r.transferSize, 0) / 1024),
      game: pick(/spellar|gsap|DrawSVG|wpacu|asset-cleanup/i),
      slowest: res.slice().sort((a, b) => b.responseEnd - a.responseEnd).slice(0, 8)
        .map((r) => ({ name: r.name.replace(/^https?:\/\/[^/]+/, '').slice(0, 90), start: Math.round(r.startTime), end: Math.round(r.responseEnd) })),
    };
  });
  console.log(JSON.stringify({ run: run + 1, phone, wall: Date.now() - t0, ...result }, null, 1));
  await context.close();
}
await browser.close();
