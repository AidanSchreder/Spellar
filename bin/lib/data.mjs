// Shared helpers for the data scripts in bin/: paths, file loading, and calendar-date
// arithmetic on "YYYY-MM-DD" strings (always in UTC, so no time zone can shift a day).

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
// Tests point this at a scratch copy of data/.
export const DATA = process.env.SPELLAR_DATA_DIR || join(ROOT, 'data');
export const WORDS_FILE = join(DATA, 'words.json');
export const SCHEDULE_FILE = join(DATA, 'schedule.json');
export const GUESSES_FILE = join(DATA, 'guesses.txt');

export const MIN_LENGTH = 4;
export const MAX_LENGTH = 7;
export const REPEAT_GAP_DAYS = 30; // a word never returns within this many days of itself
export const MAX_PROPER_RUN = 2; // no more than this many proper nouns on consecutive days

export function loadWords() {
  return JSON.parse(readFileSync(WORDS_FILE, 'utf8'));
}

export function loadSchedule() {
  try {
    return JSON.parse(readFileSync(SCHEDULE_FILE, 'utf8'));
  } catch (err) {
    if (err.code === 'ENOENT') return null;
    throw err;
  }
}

// One day per line, so a diff shows exactly which days changed.
export function saveSchedule(schedule) {
  const dates = Object.keys(schedule.days).sort();
  const lines = dates.map((d, i) => `    "${d}": "${schedule.days[d]}"${i < dates.length - 1 ? ',' : ''}`);
  const text = `{\n  "launch": "${schedule.launch}",\n  "days": {\n${lines.join('\n')}\n  }\n}\n`;
  writeFileSync(SCHEDULE_FILE, text);
}

export function loadGuesses() {
  return readFileSync(GUESSES_FILE, 'utf8').split('\n').filter(Boolean);
}

/* ---- Dates ---- */

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function isDate(s) {
  const m = DATE_RE.exec(s);
  if (!m) return false;
  const t = Date.UTC(+m[1], +m[2] - 1, +m[3]);
  return toDate(t) === s;
}

function toDate(ms) {
  return new Date(ms).toISOString().slice(0, 10);
}

function toMs(date) {
  const [y, m, d] = date.split('-').map(Number);
  return Date.UTC(y, m - 1, d);
}

export function addDays(date, n) {
  return toDate(toMs(date) + n * 86400000);
}

export function daysBetween(from, to) {
  return Math.round((toMs(to) - toMs(from)) / 86400000);
}

export function todayUtc() {
  return toDate(Date.now());
}

export function monthDay(date) {
  return date.slice(5);
}

/* ---- Seeded randomness (so a regenerated schedule is reproducible) ---- */

export function hashString(s) {
  // FNV-1a, 32-bit
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export function seededRandom(seed) {
  // mulberry32
  let a = seed >>> 0;
  return function next() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function shuffle(list, random) {
  const out = list.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export function fail(messages) {
  for (const m of messages) console.error(`  ✗ ${m}`);
  process.exitCode = 1;
}
