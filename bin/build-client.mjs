#!/usr/bin/env node
// Bundles src/ into assets/spellar.js (committed, so the server needs no build step) and copies
// GSAP and DrawSVG from node_modules into assets/vendor/.
//
//   node bin/build-client.mjs           build once
//   node bin/build-client.mjs --watch   rebuild on change

import { copyFileSync, mkdirSync, readFileSync } from 'node:fs';
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

if (process.argv.includes('--watch')) {
  const ctx = await esbuild.context(options);
  await ctx.watch();
} else {
  await esbuild.build(options);
}
