// Spellar client entry point. The [spellar] shortcode prints <div class="spellar" id="spellar-root">
// with the API and word-list addresses (and the days' puzzles) as data attributes; this mounts the
// game into it.

import { createGame } from './game.js';

function boot() {
  const root = document.getElementById('spellar-root');
  if (!root || root.dataset.mounted) return;
  root.dataset.mounted = '1';
  createGame(root, { api: root.dataset.api, guessesUrl: root.dataset.guesses, days: readDays(root) });
}

function readDays(root) {
  try {
    return JSON.parse(root.dataset.days || '{}') || {};
  } catch {
    return {};
  }
}

// This script loads async, so it can run before or after the page's parser reaches the root. If
// the root is not there yet, the inline script printed after it (assets/early.js) calls boot.
if (document.getElementById('spellar-root')) boot();
else {
  window.spellarBoot = boot;
  document.addEventListener('DOMContentLoaded', boot);
}
