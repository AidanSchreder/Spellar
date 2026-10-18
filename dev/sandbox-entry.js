// Animation sandbox (dev only): builds a board with fixed guesses and hands each motion timeline
// to GSDevTools, so it can be scrubbed frame by frame. Bundled on request by dev/mock-api.mjs.

import { buildFinale, buildReveal, buildShake, buildTitleSwap, TIMING } from '../src/motion.js';
import { createHeader } from '../src/ui/chrome.js';
import { createBoard, setTile } from '../src/ui/board.js';
import { buildSky, layoutSky } from '../src/ui/sky.js';
import { createEnd } from '../src/ui/panel.js';
import { evaluate } from '../src/evaluate.js';
import { starsFor } from '../src/constellation.js';
import { h } from '../src/ui/dom.js';

const CASES = {
  4: { answer: 'NOVA', win: ['STAR', 'NAVY', 'NOVA'], lose: ['STAR', 'CORE', 'BELT', 'DUST', 'TIDE', 'COMA'] },
  5: { answer: 'ORBIT', win: ['STAMP', 'CORAL', 'ROBIN', 'ORBIT'], lose: ['STAMP', 'CORAL', 'BRAND', 'NORTH', 'CYCLE', 'FROZE'] },
  6: { answer: 'PULSAR', win: ['PLANET', 'PURSER', 'PULSAR'], lose: ['PLANET', 'COSMIC', 'BINARY', 'ROCKET', 'GALAXY', 'METEOR', 'THRUST'] },
  7: { answer: 'ARTEMIS', win: ['PLANETS', 'STATION', 'ARTISTS', 'ARTEMIS'], lose: ['PLANETS', 'STATION', 'COMPASS', 'LIFTOFF', 'ROCKETS', 'GRAVITY', 'NEUTRON'] },
};

const root = document.getElementById('spellar-root');
const stage = h('div', { class: 'sp-play' });
root.append(stage);
let tools = null;

function setUp(len, outcome, filled) {
  const { answer } = CASES[len];
  const guesses = CASES[len][outcome];
  const rows = len <= 5 ? 6 : 7;
  root.className = 'spellar';
  root.style.setProperty('--cols', len);
  root.style.setProperty('--rows', rows);
  const board = createBoard(len, rows);
  stage.replaceChildren(board.wrap);
  const results = guesses.slice(0, filled).map((g) => evaluate(g, answer));
  results.forEach((res, r) => [...guesses[r]].forEach((c, i) => setTile(board.tiles[r][i], c, res[i])));
  return { board, answer, guesses, results, rows };
}

function show(tl) {
  if (tools) tools.kill();
  window.gsap.registerPlugin(window.GSDevTools);
  tools = window.GSDevTools.create({ animation: tl, globalSync: false, paused: true });
}

const actions = {
  pop() {
    const { board } = setUp(+lengthSel.value, 'win', 0);
    const tl = window.gsap.timeline({ paused: true });
    board.tiles[0].forEach((tile, i) => {
      tl.call(() => setTile(tile, 'ARTEMIS'[i], 'tbd'), [], i * 0.25);
      tl.fromTo(tile, { scale: 1 }, { keyframes: [{ scale: 1.06, duration: TIMING.pop / 2 }, { scale: 1, duration: TIMING.pop / 2 }], ease: 'power1.out' }, i * 0.25);
    });
    show(tl);
  },
  reveal() {
    const len = +lengthSel.value;
    const { board, guesses, answer } = setUp(len, 'win', 1);
    const guess = guesses[1];
    const res = evaluate(guess, answer);
    [...guess].forEach((c, i) => setTile(board.tiles[1][i], c, 'tbd'));
    show(buildReveal({
      tiles: board.tiles[1],
      count: len,
      look: (i, el) => setTile(el, guess[i], res[i]),
      apply: (i) => setTile(board.tiles[1][i], guess[i], res[i]),
    }, { paused: true }));
  },
  shake() {
    const { board } = setUp(+lengthSel.value, 'win', 1);
    [...'XQZVKJW'.slice(0, +lengthSel.value)].forEach((c, i) => setTile(board.tiles[1][i], c, 'tbd'));
    show(buildShake(board.rows[1], { paused: true }));
  },
  title() {
    const header = createHeader();
    root.className = 'spellar';
    stage.replaceChildren(header.el);
    show(buildTitleSwap(header.title, { paused: true }));
  },
  win() { finale('win'); },
  lose() { finale('lose'); },
};

function finale(outcome) {
  const len = +lengthSel.value;
  const { board, answer, guesses, results } = setUp(len, outcome, Infinity);
  const sky = buildSky(board.sky, starsFor(results, len));
  const end = createEnd({ answer, fact: 'A one-sentence fact about the answer sets in here.', won: outcome === 'win' });
  end.results.append(h('p', {}, 'Stats and Share appear here.'));
  stage.append(end.el);
  layoutSky(board.sky, sky, board.tiles, board.wrap);
  void guesses;
  show(buildFinale({ root, board: board.board, sky, label: end.label, fact: end.fact, results: end.results }, { paused: true }));
}

const lengthSel = document.getElementById('len');
for (const [name, fn] of Object.entries(actions)) document.getElementById(name).addEventListener('click', fn);
actions.win();
