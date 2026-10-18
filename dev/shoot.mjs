#!/usr/bin/env node
// Screenshot helper for design reviews.
//   node dev/shoot.mjs <url> <out.png> [width] [height] [--full] [--dpr=2] [--dark]

import { chromium } from '@playwright/test';

const [url, out, w = '1280', h = '800'] = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const full = process.argv.includes('--full');
const dpr = Number((process.argv.find((a) => a.startsWith('--dpr=')) || '--dpr=1').slice(6));

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: +w, height: +h }, deviceScaleFactor: dpr });
await page.goto(url, { waitUntil: 'networkidle' });
await page.evaluate(() => document.fonts.ready);
await page.screenshot({ path: out, fullPage: full });
await browser.close();
console.log(out);
