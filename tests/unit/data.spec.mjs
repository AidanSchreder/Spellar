import { test, expect } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { cpSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import vm from 'node:vm';
import { ROOT, loadSchedule, loadWords, addDays } from '../../bin/lib/data.mjs';
import { puzzleFor, maxAgeFor, metricsFor, decode, fallbackWord } from '../../bin/lib/puzzle.mjs';

const schedule = loadSchedule();
const words = loadWords();
const at = (iso) => Date.parse(iso);

test.describe('puzzle route logic', () => {
  test('accepts the server date and one day either side, nothing further', () => {
    const now = at('2026-11-10T12:00:00Z');
    for (const date of ['2026-11-09', '2026-11-10', '2026-11-11']) {
      expect(puzzleFor({ schedule, words, date, nowMs: now }).status).toBe(200);
    }
    for (const date of ['2026-11-08', '2026-11-12', '2027-11-10']) {
      expect(puzzleFor({ schedule, words, date, nowMs: now }).status).toBe(400);
    }
    for (const date of ['', '2026-11-1', '2026-02-30', '20261110', null, '2026-11-10T00']) {
      expect(puzzleFor({ schedule, words, date, nowMs: now }).status).toBe(400);
    }
  });

  test('the response has the documented shape and today\'s word, encoded', () => {
    const date = '2026-11-16'; // ARTEMIS is pinned to 11-16
    const r = puzzleFor({ schedule, words, date, nowMs: at('2026-11-16T03:00:00Z') });
    expect(Object.keys(r.body).sort()).toEqual(['answer', 'fact', 'length', 'maxGuesses', 'number', 'pinned']);
    expect(r.body).toMatchObject({ length: 7, maxGuesses: 7, pinned: true });
    expect(r.body.number).toBe(31); // launch 2026-10-17 is #1
    expect(decode(r.body.answer, date)).toBe('ARTEMIS');
    expect(decode(r.body.fact, date)).toContain('on this day');
    expect(JSON.stringify(r.body)).not.toContain('ARTEMIS');
  });

  test('6 guesses for 4-5 letters, 7 for 6-7', () => {
    const now = at('2026-10-20T12:00:00Z');
    for (const date of ['2026-10-19', '2026-10-20', '2026-10-21']) {
      const { body } = puzzleFor({ schedule, words, date, nowMs: now });
      expect(body.maxGuesses).toBe(body.length <= 5 ? 6 : 7);
    }
  });

  test('cache lifetime ends when the date ends in UTC+14', () => {
    // 2026-11-10 ends in UTC+14 at 2026-11-10T10:00Z.
    expect(maxAgeFor('2026-11-10', at('2026-11-10T09:00:00Z'))).toBe(3600);
    expect(maxAgeFor('2026-11-10', at('2026-11-09T10:00:00Z'))).toBe(86400);
    expect(maxAgeFor('2026-11-10', at('2026-11-10T10:00:01Z'))).toBe(0);
    expect(maxAgeFor('2026-11-11', at('2026-11-10T22:00:00Z'))).toBe(12 * 3600);
  });

  test('a date missing from the schedule falls back to day number mod pool size', () => {
    const gappy = { launch: schedule.launch, days: { ...schedule.days } };
    delete gappy.days['2026-12-01'];
    const r = puzzleFor({ schedule: gappy, words, date: '2026-12-01', nowMs: at('2026-12-01T12:00:00Z') });
    expect(r.fallback).toBe(true);
    const pool = words.filter((e) => !e.pin).map((e) => e.word).sort();
    expect(decode(r.body.answer, '2026-12-01')).toBe(pool[46 % pool.length]); // #46
    expect(fallbackWord(gappy, words, '2026-12-01')).toBe(pool[46 % pool.length]);
  });
});

test.describe('event validation', () => {
  const ok = (e, n = 10) => metricsFor(e, { todayNumber: n });
  test('accepts the four event types with correct payloads', () => {
    expect(ok({ type: 'start', number: 10, returning_d1: true, veteran: false }).metrics).toEqual(['starts', 'returning_d1']);
    expect(ok({ type: 'start', number: 9, returning_d1: true, veteran: true }).metrics).toEqual(['starts', 'returning_d1', 'veterans']);
    expect(ok({ type: 'finish', number: 11, won: true, guesses: 4 }).metrics).toEqual(['finishes', 'wins', 'guesses_4']);
    expect(ok({ type: 'finish', number: 10, won: false, guesses: 6 }).metrics).toEqual(['finishes', 'losses']);
    expect(ok({ type: 'share', number: 10 }).metrics).toEqual(['shares']);
    expect(ok({ type: 'french_click' }).metrics).toEqual(['french_clicks']);
  });
  test('rejects anything else', () => {
    for (const e of [
      null, {}, { type: 'hack' }, { type: 'start', number: 12, returning_d1: false, veteran: false },
      { type: 'start', number: 10 }, { type: 'start', number: '10', returning_d1: false, veteran: false },
      { type: 'finish', number: 10, won: 'yes', guesses: 3 }, { type: 'finish', number: 10, won: true, guesses: 8 },
      { type: 'finish', number: 10, won: true, guesses: 0 }, { type: 'finish', number: 10, won: true, guesses: 2.5 },
      { type: 'share', number: 8 }, { type: 'share', number: 0 },
    ]) expect(typeof ok(e)).toBe('string');
  });
});

test.describe('schedule', () => {
  test('validate-data passes on the committed data', () => {
    const out = execFileSync(process.execPath, [join(ROOT, 'bin', 'validate-data.mjs'), '--today', schedule.launch], { encoding: 'utf8' });
    expect(out).toContain('validate-data: OK');
  });

  test('extending never changes today or the past, and new words only fill new days', () => {
    const dir = mkdtempSync(join(tmpdir(), 'spellar-'));
    try {
      cpSync(join(ROOT, 'data'), dir, { recursive: true });
      const before = JSON.parse(readFileSync(join(dir, 'schedule.json'), 'utf8')).days;
      const list = JSON.parse(readFileSync(join(dir, 'words.json'), 'utf8'));
      list.push({ word: 'GEMINI', proper: true, pin: null, fact: 'A test entry.' }, { word: 'COSMOS', proper: false, pin: null, fact: 'A test entry.' });
      writeFileSync(join(dir, 'words.json'), JSON.stringify(list));
      const env = { ...process.env, SPELLAR_DATA_DIR: dir };
      execFileSync(process.execPath, [join(ROOT, 'bin', 'extend-schedule.mjs'), '--today', '2027-03-01', '--days', '450'], { env });
      const after = JSON.parse(readFileSync(join(dir, 'schedule.json'), 'utf8')).days;
      for (const d of Object.keys(before)) expect(after[d]).toBe(before[d]);
      const lastBefore = Object.keys(before).sort().pop();
      const added = Object.keys(after).filter((d) => !(d in before));
      expect(added.length).toBeGreaterThan(0);
      expect(added.every((d) => d > lastBefore)).toBe(true);
      expect(Object.values(after)).toContain('GEMINI');
      // Pins land on their anniversaries in the new stretch too.
      expect(after['2027-12-25']).toBe('WEBB');
      expect(after['2028-04-12']).toBe('VOSTOK');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('the committed schedule keeps the rotation rules', () => {
    const proper = new Map(words.map((e) => [e.word, e.proper]));
    const pinned = new Map(words.filter((e) => e.pin).map((e) => [e.word, e.pin]));
    const dates = Object.keys(schedule.days).sort();
    expect(dates[0]).toBe(schedule.launch);
    expect(dates.length).toBeGreaterThanOrEqual(366);
    let run = 0;
    const last = new Map();
    dates.forEach((d, i) => {
      const w = schedule.days[d];
      if (i) expect(addDays(dates[i - 1], 1)).toBe(d);
      run = proper.get(w) ? run + 1 : 0;
      expect(run).toBeLessThanOrEqual(2);
      if (pinned.has(w)) expect(d.slice(5)).toBe(pinned.get(w));
      else if (last.has(w)) expect(i - last.get(w)).toBeGreaterThan(30);
      last.set(w, i);
    });
  });
});

test.describe('menu dot script', () => {
  function runDot(stored, today = new Date(2026, 10, 20, 9)) {
    const link = { children: [], querySelector: () => link.children[0] || null, appendChild: (el) => link.children.push(el) };
    const doc = {
      querySelectorAll: () => [link],
      createElement: () => ({ style: {}, setAttribute() {}, className: '' }),
    };
    const storage = { getItem: () => (stored === undefined ? null : stored === 'throw' ? (() => { throw new Error('blocked'); })() : JSON.stringify(stored)) };
    const RealDate = Date;
    class FixedDate extends RealDate {
      constructor(...a) { super(...(a.length ? a : [today.getTime()])); }
      static parse(s) { return RealDate.parse(s); }
    }
    vm.runInNewContext(readFileSync(join(ROOT, 'assets', 'menu-dot.js'), 'utf8'), { document: doc, localStorage: storage, Date: FixedDate, JSON });
    return link.children.length === 1;
  }

  test('shows for a visitor who never opened the game', () => {
    expect(runDot(undefined)).toBe(true);
  });
  test('for 7 days after the first visit: shows until played today', () => {
    expect(runDot({ firstVisit: '2026-11-18' })).toBe(true);
    expect(runDot({ firstVisit: '2026-11-18', lastPlayed: '2026-11-19' })).toBe(true);
    expect(runDot({ firstVisit: '2026-11-18', lastPlayed: '2026-11-20' })).toBe(false);
    expect(runDot({ firstVisit: '2026-11-14', lastPlayed: '2026-11-19' })).toBe(true); // day 6
  });
  test('never after 7 days', () => {
    expect(runDot({ firstVisit: '2026-11-13' })).toBe(false); // day 7
    expect(runDot({ firstVisit: '2026-01-01' })).toBe(false);
  });
  test('no dot when storage is blocked', () => {
    expect(runDot('throw')).toBe(false);
  });
  test('stays under 1 KB once minified', async () => {
    const { transform } = await import('esbuild');
    const { code } = await transform(readFileSync(join(ROOT, 'assets', 'menu-dot.js'), 'utf8'), { minify: true });
    expect(Buffer.byteLength(code)).toBeLessThan(1024);
  });
});

test.describe('guardrails', () => {
  test('the name of the NYT game appears nowhere in the repository', () => {
    const banned = ['w', 'o', 'r', 'd', 'l', 'e'].join(''); // spelled out at runtime so this file passes
    const skip = new Set(['.git', 'node_modules', 'test-results', 'playwright-report', 'bin/sources', 'dev/fonts-src', 'dev/out']);
    const hits = [];
    const walk = (dir) => {
      for (const name of readdirSync(dir)) {
        const path = join(dir, name);
        const rel = relative(ROOT, path).replaceAll('\\', '/');
        if (skip.has(rel) || rel === 'SPELLAR_BUILD.md') continue;
        if (statSync(path).isDirectory()) walk(path);
        else if (!/\.(png|webm|woff2|ttf)$/.test(name) && readFileSync(path, 'utf8').toLowerCase().includes(banned)) hits.push(rel);
      }
    };
    walk(ROOT);
    expect(hits).toEqual([]);
  });
});
