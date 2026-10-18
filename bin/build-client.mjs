#!/usr/bin/env node
// Bundles src/ into assets/spellar.js (committed, so the server needs no build step) and copies
// GSAP and DrawSVG from node_modules into assets/vendor/.
//
//   node bin/build-client.mjs           build once
//   node bin/build-client.mjs --watch   rebuild on change

import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import * as esbuild from 'esbuild';
import { ROOT } from './lib/data.mjs';

const vendor = join(ROOT, 'assets', 'vendor');
mkdirSync(vendor, { recursive: true });
for (const f of ['gsap.min.js', 'DrawSVGPlugin.min.js']) {
  copyFileSync(join(ROOT, 'node_modules', 'gsap', 'dist', f), join(vendor, f));
}
const gsapVersion = JSON.parse(readFileSync(join(ROOT, 'node_modules', 'gsap', 'package.json'), 'utf8')).version;

const options = {
  entryPoints: [join(ROOT, 'src', 'main.js')],
  outfile: join(ROOT, 'assets', 'spellar.js'),
  bundle: true,
  format: 'iife',
  target: ['es2020', 'safari15', 'chrome90', 'firefox90'],
  minify: true,
  legalComments: 'none',
  banner: { js: `/* Spellar for seds.ca. Source: github.com/AidanSchreder/Spellar (src/). Uses GSAP ${gsapVersion}. */` },
  logLevel: 'info',
};

// The site-wide menu-dot script is printed inline on every page, so it ships minified (< 1 KB).
const dot = await esbuild.transform(readFileSync(join(ROOT, 'assets', 'menu-dot.js'), 'utf8'), { minify: true, target: 'es2015' });
writeFileSync(join(ROOT, 'assets', 'menu-dot.min.js'), dot.code.trim() + '\n');
console.log(`  assets\\menu-dot.min.js  ${Buffer.byteLength(dot.code.trim())} bytes`);

if (process.argv.includes('--watch')) {
  const ctx = await esbuild.context(options);
  await ctx.watch();
} else {
  await esbuild.build(options);
}
