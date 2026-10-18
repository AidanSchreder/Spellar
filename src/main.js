// Spellar client entry point. The [spellar] shortcode prints <div class="spellar" id="spellar-root">
// with the API and word-list addresses as data attributes; this mounts the game into it.

import { createGame } from './game.js';

function boot() {
  const root = document.getElementById('spellar-root');
  if (!root || root.dataset.mounted) return;
  root.dataset.mounted = '1';
  createGame(root, { api: root.dataset.api, guessesUrl: root.dataset.guesses });
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
else boot();
