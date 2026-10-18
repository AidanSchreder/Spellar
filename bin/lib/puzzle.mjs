// The puzzle route's logic in JavaScript, for the local mock API and the tests. It must give
// exactly the same answers as includes/rest.php and includes/schedule.php; tests/unit compares
// the two on the same inputs.

import { daysBetween, isDate } from './data.mjs';

export const KEY_PREFIX = 'spellar:';

// Spoiler shield, not security: the UTF-8 bytes XORed with a key made from the date, then base64.
export function encode(text, date) {
  return xorBytes(Buffer.from(text, 'utf8'), date).toString('base64');
}

export function decode(b64, date) {
  return xorBytes(Buffer.from(b64, 'base64'), date).toString('utf8');
}

function xorBytes(bytes, date) {
  const key = Buffer.from(KEY_PREFIX + date, 'utf8');
  const out = Buffer.alloc(bytes.length);
  for (let i = 0; i < bytes.length; i++) out[i] = bytes[i] ^ key[i % key.length];
  return out;
}

export function maxGuessesFor(length) {
  return length <= 5 ? 6 : 7;
}

export function utcDate(ms) {
  return new Date(ms).toISOString().slice(0, 10);
}

// A date missing from schedule.json gets a computed word: day number mod the unpinned pool.
export function fallbackWord(schedule, words, date) {
  const pool = words.filter((e) => !e.pin).map((e) => e.word).sort();
  const n = daysBetween(schedule.launch, date) + 1;
  return pool[((n % pool.length) + pool.length) % pool.length];
}

// Seconds until the requested date ends in UTC+14, the first time zone to leave it.
export function maxAgeFor(date, nowMs) {
  const end = Date.parse(`${date}T10:00:00Z`); // (date + 1) 00:00 at UTC+14
  return Math.max(0, Math.floor((end - nowMs) / 1000));
}

export function puzzleFor({ schedule, words, date, nowMs }) {
  if (typeof date !== 'string' || !isDate(date)) {
    return { status: 400, body: { code: 'spellar_bad_date', message: 'date must be YYYY-MM-DD.' } };
  }
  if (Math.abs(daysBetween(utcDate(nowMs), date)) > 1) {
    return { status: 400, body: { code: 'spellar_date_out_of_range', message: 'date must be within one day of today.' } };
  }
  if (daysBetween(schedule.launch, date) < 0) {
    return { status: 404, body: { code: 'spellar_not_started', message: `Spellar starts on ${schedule.launch}.` } };
  }
  let word = schedule.days[date];
  const fallback = !word;
  if (fallback) word = fallbackWord(schedule, words, date);
  const entry = words.find((e) => e.word === word);
  const maxAge = maxAgeFor(date, nowMs);
  return {
    status: 200,
    fallback,
    maxAge,
    body: {
      number: daysBetween(schedule.launch, date) + 1,
      length: word.length,
      maxGuesses: maxGuessesFor(word.length),
      answer: encode(word, date),
      fact: encode(entry.fact, date),
      pinned: Boolean(entry.pin),
    },
  };
}

/* ---- Events ---- */

export const EVENT_TYPES = ['start', 'finish', 'share', 'french_click'];
export const DAILY_EVENT_LIMIT = 20;

// Returns the counters to add, or an error string. Mirrors spellar_event_metrics() in PHP.
export function metricsFor(event, { todayNumber }) {
  if (!event || typeof event !== 'object' || !EVENT_TYPES.includes(event.type)) return 'unknown event type';
  if (event.type === 'french_click') return { numberless: true, metrics: ['french_clicks'] };
  const n = event.number;
  if (!Number.isInteger(n) || n < todayNumber - 1 || n > todayNumber + 1 || n < 1) return 'puzzle number out of range';
  if (event.type === 'start') {
    if (typeof event.returning_d1 !== 'boolean' || typeof event.veteran !== 'boolean') return 'start needs returning_d1 and veteran';
    const m = ['starts'];
    if (event.returning_d1) m.push('returning_d1');
    if (event.veteran) m.push('veterans');
    return { number: n, metrics: m };
  }
  if (event.type === 'finish') {
    if (typeof event.won !== 'boolean') return 'finish needs won';
    const g = event.guesses;
    if (!Number.isInteger(g) || g < 1 || g > 7) return 'guesses must be 1-7';
    return { number: n, metrics: event.won ? ['finishes', 'wins', `guesses_${g}`] : ['finishes', 'losses'] };
  }
  return { number: n, metrics: ['shares'] };
}
