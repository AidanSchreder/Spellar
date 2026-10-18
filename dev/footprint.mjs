#!/usr/bin/env node
// Measures what a page costs a first-time, logged-out visitor: number of requests, bytes
// transferred, and the list of resources. Used to show the homepage is unchanged by the plugin
// apart from the inline menu-dot script.
//   node dev/footprint.mjs <url> <label>   → dev/out/footprint-<label>.json (+ .html of the page)

import { chromium } from '@playwright/test';
import { writeFileSync, mkdirSync } from 'node:fs';

const [url = 'https://www.seds.ca/', label = 'run'] = process.argv.slice(2);
mkdirSync('dev/out', { recursive: true });
const browser = await chromium.launch();
const runs = [];
let html = '';
for (let i = 0; i < 3; i++) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } }); // fresh: no cache, no cookies
  const page = await ctx.newPage();
  const requests = [];
  page.on('requestfinished', (r) => requests.push(r));
  const res = await page.goto(url, { waitUntil: 'networkidle', timeout: 60_000 });
  await page.waitForTimeout(2500);
  let bytes = 0;
  const list = [];
  for (const r of requests) {
    const s = await r.sizes().catch(() => null);
    const size = s ? s.responseBodySize + s.responseHeadersSize : 0;
    bytes += size;
    list.push(`${r.resourceType()}\t${size}\t${r.url().replace(/([?&])(ver|v|generated)=[^&]*/g, '$1$2=*')}`);
  }
  if (i === 0) html = await res.text();
  runs.push({ requests: requests.length, bytes, list: list.sort() });
  await ctx.close();
}
await browser.close();
const median = (k) => runs.map((r) => r[k]).sort((a, b) => a - b)[1];
const out = { url, label, when: new Date().toISOString(), requests: median('requests'), bytes: median('bytes'), htmlBytes: Buffer.byteLength(html), resources: runs[0].list };
writeFileSync(`dev/out/footprint-${label}.json`, JSON.stringify(out, null, 2));
writeFileSync(`dev/out/footprint-${label}.html`, html);
console.log(`${label}: ${out.requests} requests, ${(out.bytes / 1024).toFixed(1)} KB transferred, HTML ${(out.htmlBytes / 1024).toFixed(1)} KB (median of 3)`);
