#!/usr/bin/env node
// Fills data/schedule.json with an answer for every future day that does not have one yet.
//
//   node bin/extend-schedule.mjs                 make sure the schedule reaches 400 days past today
//   node bin/extend-schedule.mjs --days 500      ... 500 days past today
//   node bin/extend-schedule.mjs --launch 2026-10-20
//                                                first run only: start a new schedule on that date
//   node bin/extend-schedule.mjs --relaunch 2026-10-20 --force
//                                                BEFORE THE GAME IS PUBLIC ONLY: throw the schedule
//                                                away and start again, with puzzle #1 on that date
//
// Rules (from the build brief):
//   - It never changes a day that already has a word, and never fills in today or a past day.
//     Adding words to words.json therefore only affects days that were not scheduled yet.
//   - A pinned word goes on its anniversary ("MM-DD") every year, and only there.
//   - Other days take unpinned words in a seeded shuffle; no word repeats until every unpinned
//     word has been used once, and never within 30 days of itself.
//   - Never more than two proper nouns on consecutive days.

import {
  MAX_PROPER_RUN, REPEAT_GAP_DAYS, addDays, daysBetween, hashString, isDate, loadSchedule,
  loadWords, monthDay, saveSchedule, seededRandom, shuffle, todayUtc,
} from './lib/data.mjs';

function option(name) {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? undefined : process.argv[i + 1];
}
const flag = (name) => process.argv.includes(`--${name}`);

const today = option('today') || todayUtc();
const horizon = Number(option('days') || 400);
if (!isDate(today) || !(horizon > 0)) {
  console.error('Usage: extend-schedule.mjs [--days N] [--launch YYYY-MM-DD] [--relaunch YYYY-MM-DD --force] [--today YYYY-MM-DD]');
  process.exit(2);
}

const words = loadWords();
const proper = new Map(words.map((e) => [e.word, e.proper === true]));
const pins = new Map(words.filter((e) => e.pin).map((e) => [e.pin, e.word]));
const pool = words.filter((e) => !e.pin).map((e) => e.word).sort();

let schedule = loadSchedule();
const relaunch = option('relaunch');
if (relaunch) {
  if (!isDate(relaunch)) throw new Error(`--relaunch needs a date, got ${relaunch}`);
  if (schedule && schedule.launch < today && !flag('force')) {
    console.error(`The schedule launched on ${schedule.launch}, before today (${today}).`);
    console.error('Relaunching renumbers every puzzle and replaces every word. Only do this before');
    console.error('the game page is public; add --force to confirm.');
    process.exit(1);
  }
  schedule = { launch: relaunch, days: {} };
}
if (!schedule) {
  const launch = option('launch') || today;
  if (!isDate(launch)) throw new Error(`--launch needs a date, got ${launch}`);
  schedule = { launch, days: {} };
}

const days = schedule.days;
const end = addDays(today, horizon);
// Days are only ever added after today; on a brand-new schedule the launch day counts too.
const firstFillable = relaunch || Object.keys(days).length === 0 ? schedule.launch : addDays(today, 1);

/* ---- Rebuild the rotation's state from the days already scheduled ---- */

const used = new Set(); // unpinned words used in the current pass through the pool
const lastSeen = new Map(); // word -> last date it was scheduled
function record(date, word) {
  lastSeen.set(word, date);
  if (!pool.includes(word)) return;
  used.add(word);
  if (pool.every((w) => used.has(w))) used.clear();
}

let remaining = null; // this pass's unused words, in shuffled order
function reshuffle(date) {
  const left = pool.filter((w) => !used.has(w));
  remaining = shuffle(left.length ? left : pool, seededRandom(hashString(`spellar|${date}`)));
}

function isProperOn(date) {
  const w = days[date] || pins.get(monthDay(date));
  return w ? proper.get(w) === true : false;
}

function properRunWith(date, word) {
  if (!proper.get(word)) return 0;
  let run = 1;
  for (let d = addDays(date, -1); days[d] && isProperOn(d); d = addDays(d, -1)) run++;
  // Look ahead only through days whose word is already fixed (scheduled, or pinned).
  for (let d = addDays(date, 1); (days[d] || pins.has(monthDay(d))) && isProperOn(d); d = addDays(d, 1)) run++;
  return run;
}

function farEnough(date, word) {
  const last = lastSeen.get(word);
  return !last || daysBetween(last, date) > REPEAT_GAP_DAYS;
}

/* ---- Walk the calendar ---- */

const warnings = [];
let added = 0;
for (let date = schedule.launch; date <= end; date = addDays(date, 1)) {
  if (days[date]) {
    record(date, days[date]);
    remaining = null;
    continue;
  }
  if (date < firstFillable) continue; // a missing past day stays missing (the server falls back)

  const pinned = monthDay(date) === '02-29' ? null : pins.get(monthDay(date));
  let word = pinned;
  if (!word) {
    if (!remaining || remaining.length === 0) {
      if (remaining && remaining.length === 0) used.clear();
      reshuffle(date);
    }
    word = remaining.find((w) => farEnough(date, w) && properRunWith(date, w) <= MAX_PROPER_RUN);
    if (!word) {
      word = remaining.find((w) => farEnough(date, w));
      if (word) warnings.push(`${date}: ${word} makes more than ${MAX_PROPER_RUN} proper nouns in a row (no other word fitted)`);
    }
    if (!word) {
      word = remaining[0];
      warnings.push(`${date}: ${word} repeats within ${REPEAT_GAP_DAYS} days (the pool is too small)`);
    }
    remaining.splice(remaining.indexOf(word), 1);
  }
  days[date] = word;
  record(date, word);
  added++;
}

schedule.days = days;
saveSchedule(schedule);

const dates = Object.keys(days).sort();
console.log(`Launch ${schedule.launch}; ${dates.length} days scheduled, ${dates[0]} to ${dates[dates.length - 1]} (${added} added).`);
console.log(`Covered until ${daysBetween(today, dates[dates.length - 1])} days after today (${today}).`);
for (const w of warnings) console.warn(`  ! ${w}`);
