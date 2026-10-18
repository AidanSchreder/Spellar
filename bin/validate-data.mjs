#!/usr/bin/env node
// Checks data/words.json, data/schedule.json and data/guesses.txt. Runs before every deploy;
// exits with code 1 (and says why) if anything would break the game or the brief's rules.
//
//   node bin/validate-data.mjs [--today YYYY-MM-DD]

import {
  MAX_LENGTH, MAX_PROPER_RUN, MIN_LENGTH, REPEAT_GAP_DAYS, addDays, daysBetween, isDate,
  loadGuesses, loadSchedule, loadWords, monthDay, todayUtc,
} from './lib/data.mjs';

const MAX_FACT_WORDS = 30; // hard limit; the brief asks for about 25
const SOFT_FACT_WORDS = 25;
const MIN_DAYS_AHEAD = 60;

const i = process.argv.indexOf('--today');
const today = i === -1 ? todayUtc() : process.argv[i + 1];

const errors = [];
const warnings = [];

/* ---- words.json ---- */

let words = [];
try {
  words = loadWords();
  if (!Array.isArray(words)) throw new Error('top level is not an array');
} catch (err) {
  errors.push(`data/words.json: ${err.message}`);
  words = [];
}

const wordRe = new RegExp(`^[A-Z]{${MIN_LENGTH},${MAX_LENGTH}}$`);
const seenWords = new Set();
const seenPins = new Map();
for (const [n, e] of words.entries()) {
  const at = `words.json entry ${n + 1}${e && e.word ? ` (${e.word})` : ''}`;
  if (!e || typeof e !== 'object') {
    errors.push(`${at}: not an object`);
    continue;
  }
  if (typeof e.word !== 'string' || !wordRe.test(e.word)) {
    errors.push(`${at}: word must be ${MIN_LENGTH}-${MAX_LENGTH} capital letters A-Z`);
  }
  if (seenWords.has(e.word)) errors.push(`${at}: duplicate word`);
  seenWords.add(e.word);

  const fact = typeof e.fact === 'string' ? e.fact.trim() : '';
  const count = fact ? fact.split(/\s+/).length : 0;
  if (!fact) errors.push(`${at}: fact is missing`);
  else if (count > MAX_FACT_WORDS) errors.push(`${at}: fact has ${count} words (limit ${MAX_FACT_WORDS})`);
  else if (count > SOFT_FACT_WORDS) warnings.push(`${at}: fact has ${count} words (aim for ${SOFT_FACT_WORDS} or fewer)`);
  if (fact && !/[.!?]$/.test(fact)) warnings.push(`${at}: fact does not end with a full stop`);

  if (typeof e.proper !== 'boolean') errors.push(`${at}: "proper" must be true or false`);

  if (e.pin !== null) {
    const ok = typeof e.pin === 'string' && /^\d{2}-\d{2}$/.test(e.pin) && isDate(`2027-${e.pin}`);
    if (!ok) errors.push(`${at}: pin must be "MM-DD" (a real date, not 02-29) or null`);
    else if (seenPins.has(e.pin)) errors.push(`${at}: pin ${e.pin} is already used by ${seenPins.get(e.pin)}`);
    else seenPins.set(e.pin, e.word);
    if (fact && !/\bon this day\b/i.test(fact)) {
      errors.push(`${at}: a pinned fact must say why it is on that day ("... on this day in YEAR")`);
    }
  }
}

/* ---- guesses.txt ---- */

let guesses = new Set();
try {
  const list = loadGuesses();
  guesses = new Set(list);
  const bad = list.filter((g) => !wordRe.test(g));
  if (bad.length) errors.push(`guesses.txt: ${bad.length} lines are not ${MIN_LENGTH}-${MAX_LENGTH} capital letters (first: ${bad[0]})`);
  if (guesses.size !== list.length) warnings.push('guesses.txt: has duplicate lines');
} catch (err) {
  errors.push(`data/guesses.txt: ${err.message}`);
}
for (const e of words) {
  if (e.word && !guesses.has(e.word)) errors.push(`answer ${e.word} is missing from guesses.txt (run bin/build-guesses.mjs)`);
}

/* ---- schedule.json ---- */

let schedule = null;
try {
  schedule = loadSchedule();
  if (!schedule) errors.push('data/schedule.json is missing (run bin/extend-schedule.mjs)');
} catch (err) {
  errors.push(`data/schedule.json: ${err.message}`);
}

if (schedule) {
  if (!isDate(schedule.launch)) errors.push(`schedule.json: launch "${schedule.launch}" is not a date`);
  const days = schedule.days || {};
  const dates = Object.keys(days).sort();
  const known = new Map(words.map((e) => [e.word, e]));

  for (const d of dates) {
    if (!isDate(d)) errors.push(`schedule.json: "${d}" is not a date`);
    if (!known.has(days[d])) errors.push(`schedule.json: ${d} is ${days[d]}, which is not in words.json`);
  }
  if (dates.length && dates[0] !== schedule.launch) {
    errors.push(`schedule.json: the first day (${dates[0]}) is not the launch day (${schedule.launch})`);
  }
  for (let n = 1; n < dates.length; n++) {
    if (addDays(dates[n - 1], 1) !== dates[n]) {
      errors.push(`schedule.json: no word between ${dates[n - 1]} and ${dates[n]}`);
    }
  }

  // The rotation rules. Past days cannot be changed any more, so only future days fail.
  const lastSeen = new Map();
  let run = 0;
  for (const d of dates) {
    const word = days[d];
    const entry = known.get(word);
    if (!entry) continue;
    const report = d > today ? errors : warnings;
    run = entry.proper ? run + 1 : 0;
    if (run > MAX_PROPER_RUN) report.push(`schedule.json: ${d} is the ${run}th proper noun in a row`);
    const last = lastSeen.get(word);
    if (last && !entry.pin && daysBetween(last, d) <= REPEAT_GAP_DAYS) {
      report.push(`schedule.json: ${word} on ${d} repeats within ${REPEAT_GAP_DAYS} days (also ${last})`);
    }
    lastSeen.set(word, d);
    if (entry.pin && monthDay(d) !== entry.pin) report.push(`schedule.json: pinned word ${word} is on ${d}, not on ${entry.pin}`);
    const pinnedHere = words.find((e) => e.pin && e.pin === monthDay(d));
    if (pinnedHere && pinnedHere.word !== word && d > today) {
      warnings.push(`schedule.json: ${d} has ${word}, but ${pinnedHere.word} is pinned to ${pinnedHere.pin} (scheduled before the pin was added?)`);
    }
  }

  const lastDay = dates[dates.length - 1];
  const ahead = lastDay ? daysBetween(today, lastDay) : -1;
  if (ahead < MIN_DAYS_AHEAD) {
    errors.push(`schedule.json: runs out on ${lastDay || '(empty)'}, ${ahead} days from today; extend it (bin/extend-schedule.mjs)`);
  }
  if (!days[today] && !days[addDays(today, -1)] && dates.length) {
    warnings.push(`schedule.json: has no word for ${today}; the server will fall back to a computed word`);
  }
}

/* ---- Report ---- */

for (const w of warnings) console.warn(`  ! ${w}`);
for (const e of errors) console.error(`  ✗ ${e}`);
if (errors.length) {
  console.error(`validate-data: ${errors.length} error(s). Fix them before deploying.`);
  process.exit(1);
}
const proper = words.filter((e) => e.proper).length;
console.log(
  `validate-data: OK. ${words.length} answers (${Math.round((100 * proper) / Math.max(words.length, 1))}% proper nouns, ` +
    `${seenPins.size} pinned), ${guesses.size} allowed guesses, schedule ${schedule.launch} to ` +
    `${Object.keys(schedule.days).sort().pop()}.`,
);
