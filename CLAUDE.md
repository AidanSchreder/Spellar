# Spellar: maintenance guide

Spellar is the daily space word puzzle at https://www.seds.ca/spellar/, a small WordPress plugin
in this repo. Read `DECISIONS.md` for why things are the way they are. The original build brief
is `SPELLAR_BUILD.md` in the local folder only (git-ignored: see "Non-negotiables").

## Server

- SSH alias `seds` (DreamHost shared hosting); site root `~/seds.ca`; plugin in
  `~/seds.ca/wp-content/plugins/spellar/`. The game page is page ID **32499**, slug `spellar`.
- **Every WP-CLI command needs PHP 8.3**: prefix it with `WP_CLI_PHP=/usr/local/php83/bin/php`
  (the default CLI PHP is 8.2 and Contact Form 7 crashes WordPress on it). For example:
  `ssh seds 'WP_CLI_PHP=/usr/local/php83/bin/php wp --path=$HOME/seds.ca spellar stats'`
- Use the Bash tool for `ssh` (PowerShell mangles quotes); pipe longer scripts in with
  `ssh seds 'bash -s' <<'EOF' … EOF`.
- The rest of the site (page cache, menu bar plugin, backups, rules about touching anything) is
  documented in the seds-web repo: `E:\Creative\SEDS Canada\Website Rework\seds-web\seds-web\CLAUDE.md`.
  Spellar must not change anything outside its own plugin folder, page and table.

## Adding words

1. Append entries to `data/words.json`: `{ "word": "GEMINI", "proper": true, "pin": null, "fact": "…" }`.
   - `word`: 4–7 capital letters A–Z. Not a person. Something a reasonably engaged space fan knows.
   - `fact`: one plain, accurate sentence, about 25 words or fewer (30 is the hard limit). Check every
     date, number and "first" with a web search, and add the source to `docs/fact-sources.md`.
   - `proper`: true if the fact treats the answer as a name (planet, star, spacecraft, mission …).
     Keep proper nouns at roughly 30–40% of all words.
2. `node bin/build-guesses.mjs` (puts the new answers into the guess list).
3. `node bin/extend-schedule.mjs` (new words only fill days not yet scheduled; it never changes
   today or the past).
4. `node bin/validate-data.mjs`, then `npx playwright test`, commit, and deploy.

Never delete or rename a word that has ever been scheduled: past days point at it. To fix a
wrong fact, edit the fact.

## Pinning a word to a date

Set `"pin": "MM-DD"` (not 02-29; one word per date). The fact **must say why it is on that day**
("… launched on this day in 1957."); `validate-data` refuses a pinned fact without "on this day".
A pinned word appears only on its anniversary. Pins apply to days not yet scheduled; if the date
is already scheduled this year, the pin takes effect from next year (validate-data warns).

## Extending the schedule

`node bin/extend-schedule.mjs` keeps the schedule 400 days ahead (`--days N` for more).
`validate-data` fails when fewer than 60 days remain, so a deploy forces an extension, and WP
admin shows a notice. If a date is ever missing, the server serves a computed word and warns in
WP admin and in `wp spellar stats`. `wp spellar schedule` shows the state.

`--relaunch DATE --force` throws the schedule away and renumbers from DATE. It exists for the day
the game first goes public and must never be used after that.

## Deploy and rollback

- `bin/deploy.sh` (add `--no-tests` to skip Playwright): validates data, checks the committed build
  matches `src/`, runs the tests, copies over SSH, runs `php -l` on the server, mirrors the files,
  smoke-tests (homepage 200, puzzle route, plugin active, no PHP errors) and clears the page
  cache's copies of /spellar/. Rebuild `assets/spellar.js` with `node bin/build-client.mjs` and
  commit it before deploying.
- Roll back: `ssh seds 'WP_CLI_PHP=/usr/local/php83/bin/php wp --path=$HOME/seds.ca plugin deactivate spellar'`.
  The site is then exactly as before (the counters table stays; nothing else remains active).
- Database backup taken before the first activation: `~/backups/seds-20261017-pre-spellar.sql.gz`.
  Take a fresh one before any database write: `wp db export - | gzip > ~/backups/seds-$(date +%F-%H%M).sql.gz`.
- Activating or deactivating any plugin clears every saved page of the site's page cache; the
  site's timer refills the menu's pages within about 40 minutes.

## Reading stats

- WP admin → Tools → Spellar: the last 30 days and all-time totals.
- `wp spellar stats --days=30` (also `--format=csv|json`).
- Counts only: starts, finishes, wins, guesses 1–7, losses, returning players (played yesterday),
  veterans (first play 7+ days ago), shares, Français clicks. No player IDs, IPs or cookies.

## Working locally

`node dev/mock-api.mjs` serves the game at http://localhost:8780/ (mock API from `data/`);
`npx playwright test` runs the unit and browser tests; `dev/sandbox.html` scrubs the animations;
`node dev/screens.mjs` and `node dev/frames.mjs` regenerate screenshots and motion contact
sheets; the PHP side runs in WordPress Playground (commands in `README.md`).

## Non-negotiables

- **Legal**: never write the name of the New York Times' daily word game anywhere (code, comments,
  UI, commit messages, meta tags); a unit test scans the repo for it, building the name at
  runtime. Copy nothing from that game or its clones. No green/yellow/grey squares, no square-emoji
  share grid.
- **Global rules**: no gradients (hard-edged stripes only), no shadows, no glow, no useless text;
  game files load only on the game's page (the menu-dot script is the only site-wide addition,
  inline, under 1 KB); touch nothing else on the site; mobile first (a 7×7 board and the keyboard
  fit a 360×640 phone); accessibility (state never by colour alone, screen-reader labels and live
  announcements, keyboard play, reduced motion).
- **Visual grammar**: rectangles (tiles, keys), dots and rings (stars), hairlines (constellation,
  scan line) and type; black ink, SEDS red `#ED2839` only for letter states and stars, one grey
  for "not in word". Every element on screen represents game state (`docs/visual-inventory.md`).
  Only four things move: letter pop, scan reveal, invalid shake, constellation.
