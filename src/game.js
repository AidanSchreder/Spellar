// One day's game: loads the puzzle, takes input, scores guesses, saves progress, and runs the
// end of the game (constellation, answer, fact, stats, sharing).

import { evaluate, isWin, mergeKeyStates } from './evaluate.js';
import { addDays, formatCountdown, localDate, msUntilMidnight } from './dates.js';
import { createStore } from './store.js';
import { notePlayed, recordGame } from './stats.js';
import { shareText } from './share.js';
import { starsFor } from './constellation.js';
import { decode } from './codec.js';
import { fetchPuzzle, loadDictionary, postEvent } from './api.js';
import { markPlayed, markVisited } from './dot.js';
import { h } from './ui/dom.js';
import { STATE_LABEL, createBoard, setTile } from './ui/board.js';
import { createKeyboard } from './ui/keyboard.js';
import { createFooter, createHeader, createLegend } from './ui/chrome.js';
import { createEnd, createShareRow, createStats } from './ui/panel.js';
import { createDialog } from './ui/dialogs.js';
import { buildSky, layoutSky } from './ui/sky.js';
import * as motion from './motion.js';

const WORD = /^[A-Z]{4,7}$/;

export function createGame(root, config) {
  const store = createStore();
  const today = localDate();
  markVisited(today);

  /* ---- Page structure ---- */

  const live = h('div', { class: 'sp-sr', role: 'status', 'aria-live': 'polite' });
  const toastEl = h('div', { class: 'sp-toast', 'aria-hidden': 'true' });
  const play = h('div', { class: 'sp-play' });
  root.replaceChildren(
    createHeader(),
    play,
    createFooter({ onHelp: openHelp, onStats: openStats, onFrench: openFrench }),
    live,
  );
  const help = createDialog(root, { title: 'How to play' });
  const statsDialog = createDialog(root, { title: 'Stats' });
  const french = createDialog(root, { title: 'Français', titleLang: 'fr', hideTitle: true, className: 'sp-dialog-small' });
  const anyDialogOpen = () => help.isOpen() || statsDialog.isOpen() || french.isOpen();

  let announceTimer = 0;
  function announce(text) {
    live.textContent = '';
    clearTimeout(announceTimer);
    announceTimer = setTimeout(() => (live.textContent = text), 60);
  }

  let toastTimer = 0;
  function toast(text) {
    toastEl.textContent = text;
    toastEl.classList.add('is-on');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove('is-on'), 1500);
    announce(text);
  }

  function sendOnce(flag, event) {
    if (store.get().sent[flag] === today) return;
    store.update((s) => (s.sent[flag] = today));
    postEvent(config.api, event);
  }

  /* ---- Loading the puzzle ---- */

  async function requestPuzzle() {
    const early = window.spellarEarly;
    if (early && early.date === today) {
      window.spellarEarly = null; // use it once; a retry asks again
      try {
        return await early.puzzle;
      } catch {
        /* fall through to a fresh request */
      }
    }
    return fetchPuzzle(config.api, today);
  }

  async function load() {
    let saved = store.get().puzzle;
    if (!saved || saved.date !== today) {
      const data = await requestPuzzle();
      saved = {
        date: today,
        number: data.number,
        length: data.length,
        maxGuesses: data.maxGuesses,
        answer: data.answer,
        fact: data.fact,
        pinned: Boolean(data.pinned),
      };
      store.update((s) => (s.puzzle = saved));
    }
    const answer = decode(saved.answer, today);
    const fact = decode(saved.fact, today);
    if (!WORD.test(answer) || answer.length !== saved.length) {
      store.update((s) => (s.puzzle = null));
      throw new Error('puzzle did not decode');
    }
    return { ...saved, answer, fact };
  }

  function showError() {
    play.replaceChildren(
      h(
        'div',
        { class: 'sp-error' },
        h('p', {}, "Today's puzzle could not be loaded. Check your connection and try again."),
        h('button', { type: 'button', class: 'sp-button', onclick: () => run() }, 'Try again'),
      ),
    );
  }

  let game = null;
  async function run() {
    play.replaceChildren();
    root.classList.add('is-loading');
    try {
      const puzzle = await load();
      root.classList.remove('is-loading');
      game = startGame(puzzle);
    } catch {
      root.classList.remove('is-loading');
      showError();
    }
  }

  /* ---- Dialogs ---- */

  function openHelp() {
    const example = (letter, state, text) =>
      h('li', {}, h('span', { class: 'sp-tile sp-tile-mini', 'data-state': state, role: 'img', 'aria-label': `${letter}, ${STATE_LABEL[state]}` }, h('span', { class: 'sp-l' }, letter)), h('span', {}, text));
    help.open([
      h('p', {}, "Guess the day's space word. It is 4 to 7 letters long, and you get 6 tries, or 7 for 6- and 7-letter words."),
      h('p', {}, 'Each guess must be a real word. Press Enter and the tiles show how close you were:'),
      h(
        'ul',
        { class: 'sp-examples' },
        example('O', 'correct', 'Right spot: the letter is in the word, in this place.'),
        example('R', 'present', 'Wrong spot: the letter is in the word, somewhere else.'),
        example('B', 'absent', 'Not in word.'),
      ),
      h('p', {}, 'Finish, and your guesses become a constellation, with a fact about the answer.'),
      h('p', {}, 'A new Spellar every day at midnight, your time.'),
    ]);
  }

  function openStats() {
    statsDialog.open(game ? game.statsContent() : createStats(store.get().stats, { todayNumber: 0, maxGuesses: 6, today: null }));
  }

  function openFrench() {
    sendOnce('french', { type: 'french_click' });
    french.open([
      h('p', { class: 'sp-fr', lang: 'fr' }, 'Une version française est en préparation.'),
      h('p', { class: 'sp-fr-en' }, 'A French version is in the works.'),
    ]);
  }

  /* ---- The game ---- */

  function startGame(puzzle) {
    const { answer, fact, number } = puzzle;
    const cols = answer.length;
    const rows = puzzle.maxGuesses;
    root.style.setProperty('--cols', cols);
    root.style.setProperty('--rows', rows);

    if (!store.get().game || store.get().game.number !== number) {
      store.update((s) => (s.game = { number, date: today, guesses: [], status: 'playing' }));
    }
    const saved = () => store.get().game;

    const board = createBoard(cols, rows);
    const keyboard = createKeyboard(onKey);
    const legend = createLegend();
    play.replaceChildren(board.wrap, legend, keyboard.el, toastEl);

    const results = [];
    const keys = {};
    saved().guesses.forEach((guess, r) => {
      const res = evaluate(guess, answer);
      results.push(res);
      [...guess].forEach((c, i) => setTile(board.tiles[r][i], c, res[i]));
      mergeKeyStates(keys, guess, res);
    });
    for (const [k, v] of Object.entries(keys)) keyboard.setState(k, v);

    let current = '';
    let locked = false;
    let finale = null; // the end sequence while it plays

    function onKey(k) {
      if (locked || saved().status !== 'playing') return;
      if (k === 'Enter') submit();
      else if (k === 'Backspace') removeLetter();
      else if (/^[A-Z]$/.test(k)) addLetter(k);
    }

    function addLetter(c) {
      if (current.length >= cols) return;
      const tile = board.tiles[saved().guesses.length][current.length];
      current += c;
      setTile(tile, c, 'tbd');
      motion.pop(tile);
    }

    function removeLetter() {
      if (!current) return;
      current = current.slice(0, -1);
      setTile(board.tiles[saved().guesses.length][current.length], '', 'empty');
    }

    function rejected(message) {
      motion.shake(board.rows[saved().guesses.length]);
      toast(message);
    }

    async function submit() {
      const r = saved().guesses.length;
      if (current.length < cols) return rejected('Not enough letters');
      locked = true;
      let dictionary;
      try {
        dictionary = await loadDictionary(config.guessesUrl);
      } catch {
        locked = false;
        return toast('The word list did not load. Try again.');
      }
      if (!dictionary.has(current)) {
        locked = false;
        return rejected('Not in word list');
      }
      const guess = current;
      current = '';
      const res = evaluate(guess, answer);
      if (r === 0) firstGuessOfDay();
      store.update((s) => s.game.guesses.push(guess));
      results.push(res);

      board.board.setAttribute('aria-busy', 'true'); // the row is being revealed; input is locked
      await motion.reveal({
        row: board.rows[r],
        tiles: board.tiles[r],
        scan: board.scan,
        count: cols,
        apply: (i) => setTile(board.tiles[r][i], guess[i], res[i]),
      });
      board.board.removeAttribute('aria-busy');
      mergeKeyStates(keys, guess, res);
      for (const [k, v] of Object.entries(keys)) keyboard.setState(k, v);
      announce(`Guess ${r + 1} of ${rows}: ` + [...guess].map((c, i) => `${c} ${STATE_LABEL[res[i]]}`).join(', ') + '.');

      if (isWin(res)) return end(true);
      if (r + 1 >= rows) return end(false);
      locked = false;
    }

    function firstGuessOfDay() {
      let flags = null;
      store.update((s) => (flags = notePlayed(s.stats, today, addDays(today, -1))));
      sendOnce('start', { type: 'start', number, returning_d1: flags.returningD1, veteran: flags.veteran });
    }

    async function end(won) {
      locked = true;
      const guesses = saved().guesses.length;
      store.update((s) => {
        s.game.status = won ? 'won' : 'lost';
        recordGame(s.stats, { number, won, guesses, length: cols, stars: starsFor(results, cols) });
      });
      sendOnce('finish', { type: 'finish', number, won, guesses });
      markPlayed(today);
      announce(won ? `Solved in ${guesses} ${guesses === 1 ? 'guess' : 'guesses'}.` : 'Out of guesses.');
      await showFinished(true);
    }

    /* ---- The finished state ---- */

    let shareRow = null;
    let countdownTimer = 0;

    function countdownText() {
      return `Next Spellar in ${formatCountdown(msUntilMidnight())}`;
    }

    function tick() {
      const left = msUntilMidnight();
      if (left <= 1000) {
        clearInterval(countdownTimer);
        setTimeout(() => window.location.reload(), 1500);
        return;
      }
      for (const el of root.querySelectorAll('.sp-next')) el.textContent = countdownText();
    }

    function statsContent() {
      const g = saved();
      const done = g.status !== 'playing';
      const stats = createStats(store.get().stats, {
        todayNumber: number,
        maxGuesses: rows,
        today: done ? { won: g.status === 'won', guesses: g.guesses.length } : null,
      });
      return done ? [stats, createShareRow({ onShare: share, countdownText: countdownText() }).el] : stats;
    }

    async function share() {
      const g = saved();
      const text = shareText({ number, rows: results, maxGuesses: rows, won: g.status === 'won' });
      sendOnce('share', { type: 'share', number });
      const touch = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
      if (touch && navigator.share) {
        try {
          await navigator.share({ text });
          return;
        } catch (err) {
          if (err && err.name === 'AbortError') return;
        }
      }
      toast((await copy(text)) ? 'Copied' : 'Copy failed');
    }

    async function copy(text) {
      try {
        await navigator.clipboard.writeText(text);
        return true;
      } catch {
        try {
          const area = h('textarea', { class: 'sp-copy', 'aria-hidden': 'true', readonly: true });
          area.value = text;
          root.append(area);
          area.select();
          const ok = document.execCommand('copy');
          area.remove();
          return ok;
        } catch {
          return false;
        }
      }
    }

    async function showFinished(animate) {
      const won = saved().status === 'won';
      const stars = starsFor(results, cols);
      const sky = buildSky(board.sky, stars);
      const endBlock = createEnd({ answer, fact, won });
      shareRow = createShareRow({ onShare: share, countdownText: countdownText() });
      const statsBlock = createStats(store.get().stats, {
        todayNumber: number,
        maxGuesses: rows,
        today: { won, guesses: saved().guesses.length },
      });
      endBlock.results.append(statsBlock, shareRow.el);
      keyboard.el.remove();
      legend.remove();
      play.insertBefore(endBlock.el, toastEl);
      root.classList.add('is-done');

      // The constellation is drawn from the real tile boxes; measure again on every resize.
      const relayout = () => layoutSky(board.sky, sky, board.tiles, board.wrap);
      relayout();
      if ('ResizeObserver' in window) new ResizeObserver(relayout).observe(board.wrap);
      else window.addEventListener('resize', relayout);

      const parts = {
        root, board: board.board, wrap: board.wrap, svg: board.sky, sky, label: endBlock.label,
        fact: endBlock.fact, results: endBlock.results, stars,
      };
      if (animate && !motion.prefersReducedMotion()) {
        finale = motion.finale({ ...parts, showSky: () => {}, showText: () => {} });
        await finale;
        finale = null;
      } else {
        root.classList.add('is-sky');
      }

      // After the sequence, tapping the constellation shows the guesses at full strength and back.
      board.wrap.setAttribute('role', 'button');
      board.wrap.setAttribute('tabindex', '0');
      board.wrap.setAttribute('aria-pressed', 'false');
      board.wrap.setAttribute('aria-label', 'Show guesses at full strength');
      const toggle = () => {
        const on = root.classList.toggle('is-review');
        board.wrap.setAttribute('aria-pressed', String(on));
      };
      board.wrap.addEventListener('click', toggle);
      board.wrap.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          toggle();
        }
      });
      countdownTimer = setInterval(tick, 15000);
    }

    // A tap anywhere on the page, or any key, during the end sequence skips straight to its end.
    document.addEventListener('pointerdown', () => finale && motion.skip());

    function onKeydown(e) {
      if (finale) return void motion.skip();
      if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey || anyDialogOpen()) return;
      const t = e.target;
      if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
      if (e.key === 'Enter') {
        if (t && t.closest && t.closest('button, a, summary, [role="button"]')) return; // let it press that control
        e.preventDefault();
        onKey('Enter');
      } else if (e.key === 'Backspace') {
        e.preventDefault();
        onKey('Backspace');
      } else if (/^[a-z]$/i.test(e.key)) {
        onKey(e.key.toUpperCase());
      }
    }
    document.addEventListener('keydown', onKeydown);

    if (saved().status !== 'playing') {
      showFinished(false);
    } else {
      // Fetch the word list while the player thinks about the first guess.
      const later = window.requestIdleCallback || ((fn) => setTimeout(fn, 200));
      later(() => loadDictionary(config.guessesUrl).catch(() => {}));
    }

    return { statsContent, results, answer };
  }

  run();
  return { store };
}
