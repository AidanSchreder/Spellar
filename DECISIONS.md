# Decisions

One line per decision: **what** — why — how to change it. Newest at the bottom of each section.
The design decisions in the build brief are Aidan's and are not repeated here; this log covers
what the brief left open and what was found on the site.

## Site facts (found 2026-10-17)

- **Brand red is `#ED2839`** — it is the Elementor kit's Primary and Accent colour and its saved "SEDS Red" (kit 6414), Astra's theme and link colour (`astra-settings` → `theme-color`, `link-color`, palette slot 0), and the colour used 57 times in the homepage's CSS (header, buttons, links). Change: `--sp-red` at the top of `assets/spellar.css`.
- **Site sans-serif is Source Sans Pro** — Astra's body font (`'Source Sans Pro', sans-serif`) and the Elementor kit's Text/Accent font; the menu uses it at 600. Elementor pages load every weight from `wp-content/uploads/elementor/google-fonts/`; Astra loads weight 400 from Google Fonts on every page. The "SEDS" label uses it and falls back to the system sans. Change: `--sp-sans` in `assets/spellar.css`.
- **WP-CLI needs PHP 8.3 on the server** — the command line defaults to PHP 8.2 and Contact Form 7 refuses to load on it, so every `wp` command that loads WordPress crashes. Every server command and `bin/deploy.sh` sets `WP_CLI_PHP=/usr/local/php83/bin/php`. Change: the `WP_CLI_PHP` line in `bin/deploy.sh` if the site moves to a newer PHP.
- **The "Elementor mobile menu" is the site's own menu bar** — the header is Astra's, restyled by the must-use plugin `seds-nav` (seds-web repo); below 1,100 px its drawer reuses the same `#primary-menu` list, and links that do not fit move under "More" as the same `<li>` elements. So the menu dot only has to find `.spellar-menu-item` once.
- **No SEO plugin is active and the site is public (`blog_public` = 1)** — "SEO noindex left at the site default" therefore means: indexable, nothing set on the page.

## Repo and tooling

- **The build brief (`SPELLAR_BUILD.md`) is not committed** — it names the game Spellar must never be compared to, and the acceptance checklist forbids that name anywhere in the repo. It stays in the local folder, git-ignored. Change: commit a copy with that name removed.
- **All text files use LF line endings** (`.gitattributes`) — this machine's Git has `core.autocrlf=true`, which would break the shell and PHP files on the Linux server.
- **GSAP 3.15.0** from npm; GreenSock's skills are in `.claude/skills/` (MIT, committed so later sessions have them).
- **Client source is bundled with esbuild** — `src/` (ES modules, unit-testable) → `assets/spellar.js` (one minified IIFE, committed). GSAP and DrawSVG stay separate files in `assets/vendor/` so they are cached independently of game updates. Change: `bin/build-client.mjs`.

## Data

- **Allowed guesses = ENABLE + a SCOWL top-up − two blocklists + every answer** (50,864 words). ENABLE (public domain, [dolph/dictionary @694bf95](https://github.com/dolph/dictionary)) is the base. It lacks about 250 common modern words (EMAIL, ONLINE, AIRLOCK, WEBSITE), so SCOWL size 50 (US/GB/CA, [app.aspell.net](http://app.aspell.net/create), © Kevin Atkinson, permissive licence) fills those in, minus a hand list of abbreviations. Removed: the LDNOOBW English list ([CC BY 4.0](https://github.com/LDNOOBW/List-of-Dirty-Naughty-Obscene-and-Otherwise-Bad-Words), mostly sexual terms) and, from [dsojevic/profanity-list](https://github.com/dsojevic/profanity-list) (MIT), every entry of severity 2+ and every racial or anti-LGBTQ slur, each with its plural and other simple endings. Some blocked words have innocent meanings too (DYKE, PANSY); blocking them as guesses was judged the smaller harm. Change: `bin/build-guesses.mjs`, then re-run it.
- **`words.json` entries carry a fourth field, `"proper": true/false`** — the brief limits proper nouns to 30–40% and to two days in a row, which needs a per-word flag. "Proper" means the fact treats the answer as a name (planet, star, constellation, spacecraft, mission). Change: edit the flag; `validate-data` requires it.
- **Pinned facts must contain "on this day"** — `validate-data` enforces the brief's rule that a pinned fact says why it is on that day.
- **A pinned word appears only on its anniversary** (once a year); the daily rotation draws from the unpinned words. 02-29 cannot be pinned.
- **The schedule's launch date is provisional: 2026-10-17** — puzzle #1 should be the day the page is published. Before publishing, `node bin/extend-schedule.mjs --relaunch <date> --force` renumbers and regenerates it; after publishing that must never be run again.
- **Schedule generated 400 days ahead** (the brief asks for at least 365). `validate-data` fails when fewer than 60 days remain, so a deploy forces an extension.
- **Every dated or numbered fact was checked by web search on 2026-10-17**; sources in `docs/fact-sources.md`, open questions in `docs/word-review.md`.

## Look and layout

- **Wordmark: variant (a), a red "t" at 45% opacity over a black "p", in Cormorant Garamond 600** — (b) the black t at 25% read as a grey smudge; (c) EB Garamond was heavier and less atlas-like; Playfair's thick t stem looked like a glitch. The t is placed exactly on the p's stem: measured from rendered glyphs, both stems sit the same distance from the glyph's start, so the t starts where the p starts. Placed over the p (not behind it), the p's upper stem turns dark red and a whole red t emerges from it, so "Spellar" reads first and "Stellar" on a second look. Images: `docs/screens/wordmark-*.png`, study sheet `dev/wordmark.html`. Change: `.sp-t` in `assets/spellar.css`.
- **The display font is one weight (600), Basic Latin only, 10.8 KB** — `bin/build-fonts.py` cuts it from Google's variable font (OFL; licence in `assets/fonts/OFL.txt`). Used for the wordmark, the answer label and dialog titles. Change: `SHIP` in the script, then the `@font-face` rule.
- **Tiles, keys, stats and body text use the site's own Source Sans Pro, not a copy of it** — the theme already loads it on every page, so the game adds no font request for it. Falls back to the system sans.
- **All CSS is scoped to the root element by its id (`#spellar-root`, the same element as `.spellar`), and the root starts from `all: initial`** — rules for plain elements from the theme or Elementor (`.elementor-kit-6414 button`, `h2` ...) would otherwise tie with or beat class-only selectors; an id prefix outranks them all and nothing inherited leaks in. Change: the prefix throughout `assets/spellar.css`.
- **Tile size follows a height budget that includes the site's header** (64 px on phones, 76 px from 1,100 px; it scrolls away but is on screen at first): on a 360×640 phone the whole game, wordmark to keyboard, fits below the header with 41 px tiles. Change: `--sp-above` and `--sp-chrome` in `assets/spellar.css`.
- **Contrast** — white on SEDS red is 4.2:1, so key letters are 19 px bold (WCAG "large text", needing 3:1) and tile letters are larger still. Grey letters on the grey "not in word" fill (#5E5E5E on #DCDCDC) are 4.7:1. The red "SEDS" and the 45% red t are part of the logotype, which WCAG exempts.
- **No icons anywhere**: the delete key says "Delete", dialogs close with a "Close" button, and the stats open from a text button.
- **Guess distribution: outlined bars, today's bar filled black** — red is kept for letter states and stars only.
- **Results appear in place of the keyboard** once the game ends (answer label, fact, stats, Share, countdown); the footer's Stats button opens the same numbers in a dialog at any time. While reviewing the board at full strength the constellation is hidden, since stars sit on the letters.
- **When the countdown reaches midnight the page reloads** to bring in the next puzzle; a game still in progress at midnight is left alone.

## Behaviour

- **The fact is obfuscated in the API response too, not only the answer** — most facts contain the answer word, so a readable fact in the network tab would spoil the puzzle as surely as the answer. Same XOR-and-base64 shield, same field names.
- **The puzzle is requested as early as possible and kept for the day** — a WordPress REST request takes about 2.5 s on this host. A tiny inline script printed after the root element starts the request while the page is still loading, and the response is saved with the game state, so a return visit the same day renders at once with no request. Change: `assets/early.js`.
- **The guess list is a plain text file the browser downloads once** (`data/guesses.txt`, 363 KB, about 122 KB gzipped, cached by the browser), fetched while the player thinks about the first guess. Checking guesses on the server would cost a 2.5 s WordPress request per guess.
- **"Played today" (which hides the menu dot) means today's puzzle was finished** — a started but unfinished game keeps the reminder.
- **No menu dot when browser storage is blocked** — the script cannot tell a new visitor from a regular, and a dot that never goes away would be worse than none.
- **On phones (coarse pointer) Share uses the system share sheet; elsewhere it copies** and shows "Copied", as the brief asks.
- **Event dates**: start, finish and share are counted on the puzzle's date (so a row of the stats table is one puzzle); Français clicks on the server's UTC date.
