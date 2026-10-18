#!/usr/bin/env node
// Local stand-in for WordPress: serves the game harness and the same JSON as the plugin's REST
// routes, straight from data/. No PHP needed.
//
//   node dev/mock-api.mjs            then open http://localhost:8780/
//
// Dev-only routes: POST /dev/now {"now": ISO string | null} pins the server clock,
// POST /dev/reset clears counters and rate limits, GET /dev/stats returns the counters.

import { createServer } from 'node:http';
import { createReadStream, existsSync, readFileSync, statSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';
import { ROOT, loadSchedule, loadWords } from '../bin/lib/data.mjs';
import { DAILY_EVENT_LIMIT, metricsFor, puzzleFor, utcDate } from '../bin/lib/puzzle.mjs';
import { daysBetween, addDays } from '../bin/lib/data.mjs';

const PORT = Number(process.env.PORT || 8780);
const API = '/wp-json/spellar/v1/';

let nowOverride = process.env.MOCK_NOW ? Date.parse(process.env.MOCK_NOW) : null;
const now = () => nowOverride ?? Date.now();
let counters = {};
let rateLimits = {};

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.txt': 'text/plain; charset=utf-8',
  '.woff2': 'font/woff2', '.svg': 'image/svg+xml', '.png': 'image/png',
};

// Only these folders are reachable, like the deployed plugin (data/*.json is denied there too).
const STATIC = ['/assets/', '/dev/', '/data/guesses.txt', '/node_modules/gsap/dist/'];

function send(res, status, body, headers = {}) {
  const isText = typeof body === 'string';
  res.writeHead(status, { 'Content-Type': isText ? 'text/plain; charset=utf-8' : 'application/json; charset=utf-8', ...headers });
  res.end(isText ? body : JSON.stringify(body));
}

function readBody(req) {
  return new Promise((resolve) => {
    let data = '';
    req.on('data', (c) => { data += c; if (data.length > 4096) req.destroy(); });
    req.on('end', () => resolve(data));
  });
}

function harness(url) {
  // The same markup the [spellar] shortcode prints, plus the dev page around it.
  const early = readFileSync(join(ROOT, 'assets', 'early.js'), 'utf8');
  const version = String(statSync(join(ROOT, 'assets', 'spellar.js')).mtimeMs | 0);
  const root = `<div class="spellar" id="spellar-root" data-api="${API}" data-guesses="/data/guesses.txt?ver=${version}"></div>\n<script>${early}</script>`;
  return readFileSync(join(ROOT, 'dev', 'harness.html'), 'utf8')
    .replace('<!-- SPELLAR -->', root)
    .replaceAll('{{ver}}', version)
    .replace('{{site}}', url.searchParams.get('site') === 'live' ? readFileSync(join(ROOT, 'dev', 'site-css.html'), 'utf8') : '');
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const path = decodeURIComponent(url.pathname);

  if (path === '/' || path === '/harness') {
    return send(res, 200, harness(url), { 'Content-Type': TYPES['.html'], 'Cache-Control': 'no-store' });
  }

  if (path === `${API}puzzle` && req.method === 'GET') {
    const result = puzzleFor({ schedule: loadSchedule(), words: loadWords(), date: url.searchParams.get('date'), nowMs: now() });
    if (result.status !== 200) return send(res, result.status, result.body, { 'Cache-Control': 'no-store' });
    return send(res, 200, result.body, {
      'Cache-Control': `public, max-age=${result.maxAge}`,
      Expires: new Date(now() + result.maxAge * 1000).toUTCString(),
    });
  }

  if (path === `${API}event` && req.method === 'POST') {
    let event = null;
    try { event = JSON.parse(await readBody(req)); } catch { /* invalid JSON */ }
    const schedule = loadSchedule();
    const today = utcDate(now());
    const todayNumber = daysBetween(schedule.launch, today) + 1;
    const result = metricsFor(event, { todayNumber });
    if (typeof result === 'string') return send(res, 400, { code: 'spellar_bad_event', message: result });
    const ip = req.socket.remoteAddress;
    const rlKey = `${today}|${ip}`;
    rateLimits[rlKey] = (rateLimits[rlKey] || 0) + 1;
    if (rateLimits[rlKey] > DAILY_EVENT_LIMIT) return send(res, 429, { code: 'spellar_rate_limited', message: 'Too many events today.' });
    const date = result.numberless ? today : addDays(schedule.launch, result.number - 1);
    for (const m of result.metrics) {
      counters[date] ??= {};
      counters[date][m] = (counters[date][m] || 0) + 1;
    }
    return send(res, 200, { ok: true }, { 'Cache-Control': 'no-store' });
  }

  if (path === '/dev/now' && req.method === 'POST') {
    const body = JSON.parse((await readBody(req)) || '{}');
    nowOverride = body.now ? Date.parse(body.now) : null;
    return send(res, 200, { now: new Date(now()).toISOString() });
  }
  if (path === '/dev/reset' && req.method === 'POST') {
    counters = {};
    rateLimits = {};
    return send(res, 200, { ok: true });
  }
  if (path === '/dev/stats') return send(res, 200, counters, { 'Cache-Control': 'no-store' });

  if (STATIC.some((p) => path === p || path.startsWith(p))) {
    const file = normalize(join(ROOT, path));
    if (file.startsWith(ROOT) && existsSync(file) && statSync(file).isFile()) {
      res.writeHead(200, { 'Content-Type': TYPES[extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
      return createReadStream(file).pipe(res);
    }
  }
  send(res, 404, 'Not found');
});

server.listen(PORT, () => console.log(`Spellar harness on http://localhost:${PORT}/`));
