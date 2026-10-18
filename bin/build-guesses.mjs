#!/usr/bin/env node
// Builds data/guesses.txt, the list of words a player may guess.
//
//   node bin/build-guesses.mjs
//
// 1. ENABLE (public domain), every 4-7 letter word: the base list.
// 2. SCOWL size 50 (US, GB and CA spellings): fills the modern gaps ENABLE has, such as
//    EMAIL, ONLINE and AIRLOCK. A small hand list below drops the abbreviations it brings.
// 3. Offensive words are removed: the LDNOOBW English list (CC BY 4.0, mostly sexual terms),
//    and from dsojevic/profanity-list (MIT) every entry rated severity 2 or more plus every
//    racial or anti-LGBTQ slur at any severity. The plural and other simple endings of each
//    blocked word are removed too, and so is the hand list below.
// 4. Every answer in data/words.json is added back, so names such as ARTEMIS can be typed.
//
// The sources are downloaded once into bin/sources/ (git-ignored) and checked against the
// SHA-256 recorded here. Sources and licences are listed in DECISIONS.md.

import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { GUESSES_FILE, MAX_LENGTH, MIN_LENGTH, ROOT, loadWords } from './lib/data.mjs';

const SOURCES = join(ROOT, 'bin', 'sources');

const LISTS = {
  enable: {
    file: 'enable1.txt',
    url: 'https://raw.githubusercontent.com/dolph/dictionary/694bf9529e986f9175dcbf5fe5875d111941b708/enable1.txt',
    sha256: '3f16130220645692ed49c7134e24a18504c2ca55b3c012f7290e3e77c63b1a89',
  },
  scowl: {
    file: 'scowl-50.txt',
    // Generated on request by SCOWL's own site; the file names the database revision it came from.
    url: 'http://app.aspell.net/create?max_size=50&spelling=US&spelling=GBs&spelling=CA&max_variant=0&diacritic=strip&download=wordlist&encoding=utf-8&format=inline',
    sha256: '3a5743b24ec7725447d494b54dff41b613a8f87684bf71e0f44e633f33bda193',
    mayChange: true,
  },
  blocklist: {
    file: 'ldnoobw-en.txt',
    url: 'https://raw.githubusercontent.com/LDNOOBW/List-of-Dirty-Naughty-Obscene-and-Otherwise-Bad-Words/4638b970cb8d9d82789564fcba1f4a1eb508ff1a/en',
    sha256: 'af851ecef1d5f212caba17339b12ac39cc2fef7d78c74876f67237644fcee8bd',
  },
  slurs: {
    file: 'dsojevic-en.json',
    url: 'https://raw.githubusercontent.com/dsojevic/profanity-list/c27924319aa9bd6f917e3782b4f4b6604a50b652/en.json',
    sha256: 'bcf8bfc09dd3f7480972cb041a4cba291a6ff16a6fbf29022d5d679e3c39502c',
  },
};

// Abbreviations SCOWL counts as words, which nobody would guess as one.
const NOT_WORDS = `abbr acct advt approx assn assoc asst atty avdp bldg blvd chem comm conj cont contd
  corp dept govt ibid illus initio interj masc misc mkay natl nauseam poss pres pron recd resp secy
  situ subj tbsp treas vols wkly`;

// Crude words the blocklist misses because it lists a different form of them.
const ALSO_BLOCKED = `arsed arsing ballsed ballses milfs`;

// Endings that turn a blocked word into another form of it (slurs as plurals, and so on).
const ENDINGS = ['', 's', 'es', 'ed', 'd', 'er', 'ers', 'ing', 'z', 'y'];

async function source(name) {
  const list = LISTS[name];
  const path = join(SOURCES, list.file);
  if (!existsSync(path)) {
    mkdirSync(SOURCES, { recursive: true });
    console.log(`Downloading ${list.file} ...`);
    const res = await fetch(list.url);
    if (!res.ok) throw new Error(`${list.url} answered ${res.status}`);
    writeFileSync(path, Buffer.from(await res.arrayBuffer()));
  }
  const bytes = readFileSync(path);
  const sha = createHash('sha256').update(bytes).digest('hex');
  if (sha !== list.sha256) {
    const msg = `${list.file} has SHA-256 ${sha}, expected ${list.sha256}`;
    if (!list.mayChange) throw new Error(msg);
    console.warn(`  ! ${msg} (SCOWL regenerates its lists; check the diff of guesses.txt)`);
  }
  return bytes.toString('utf8').replace(/\r/g, '');
}

function lettersOnly(words) {
  const re = new RegExp(`^[a-z]{${MIN_LENGTH},${MAX_LENGTH}}$`);
  return words.filter((w) => re.test(w));
}

const enable = lettersOnly((await source('enable')).split('\n'));
// SCOWL's file starts with its licence text, then a line of dashes, then the words.
const scowlText = await source('scowl');
const scowl = lettersOnly(scowlText.slice(scowlText.indexOf('\n---') + 4).split('\n'));
const blockRoots = (await source('blocklist')).split('\n');
for (const entry of JSON.parse(await source('slurs'))) {
  const slur = entry.tags.includes('racial') || entry.tags.includes('lgbtq');
  if (entry.severity >= 2 || slur) blockRoots.push(...entry.match.split('|'));
}

const blocked = new Set(ALSO_BLOCKED.split(/\s+/).filter(Boolean));
for (const raw of blockRoots) {
  const root = raw.trim().toLowerCase();
  if (!/^[a-z]+$/.test(root)) continue; // phrases and wildcard patterns cannot match a single guess
  for (const end of ENDINGS) blocked.add(root + end);
  if (root.endsWith('y')) {
    blocked.add(root.slice(0, -1) + 'ies');
    blocked.add(root.slice(0, -1) + 'ied');
  }
}
const notWords = new Set(NOT_WORDS.split(/\s+/).filter(Boolean));

const all = new Set(enable);
let added = 0;
for (const w of scowl) {
  if (!all.has(w) && !notWords.has(w)) {
    all.add(w);
    added++;
  }
}
let removed = 0;
for (const w of [...all]) {
  if (blocked.has(w)) {
    all.delete(w);
    removed++;
  }
}

const answers = loadWords().map((e) => e.word.toLowerCase());
let answersAdded = 0;
for (const w of answers) {
  if (blocked.has(w)) console.warn(`  ! answer ${w.toUpperCase()} is on the blocklist; kept because it is an answer`);
  if (!all.has(w)) {
    all.add(w);
    answersAdded++;
  }
}

const out = [...all].map((w) => w.toUpperCase()).sort();
writeFileSync(GUESSES_FILE, out.join('\n') + '\n');

const byLength = {};
for (const w of out) byLength[w.length] = (byLength[w.length] || 0) + 1;
console.log(`ENABLE ${enable.length}, +${added} from SCOWL, -${removed} blocked, +${answersAdded} answers`);
console.log(`Wrote ${out.length} words to data/guesses.txt  (${Object.entries(byLength).map(([n, c]) => `${n}: ${c}`).join(', ')})`);
