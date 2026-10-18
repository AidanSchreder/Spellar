# Spellar

A daily space word puzzle for [seds.ca/spellar](https://www.seds.ca/spellar/), built for SEDS Canada
(Students for the Exploration and Development of Space).

One answer a day, the same for every player, 4 to 7 letters long. Every answer comes with a
one-sentence space fact, and a solved puzzle draws a constellation from the player's own guesses.

It is a small WordPress plugin: the `[spellar]` shortcode renders the game, two REST routes serve
the day's puzzle and count anonymous plays, and the content lives in `data/` as plain files.
Maintenance (adding words, deploying, reading stats): see `CLAUDE.md`. Decisions: `DECISIONS.md`.

## Working on it

```bash
npm install
node dev/mock-api.mjs            # the game at http://localhost:8780/ against a mock of the API
node bin/build-client.mjs        # rebuild assets/spellar.js after changing src/
npx playwright test              # unit and browser tests (starts the mock server itself)
```

- `dev/sandbox.html` (on the mock server): scrub each animation with GSDevTools.
- `node dev/screens.mjs` and `node dev/frames.mjs`: screenshots and motion contact sheets in `docs/screens/`.
- The PHP side, in a throwaway local WordPress (WordPress Playground, no PHP install needed):

```bash
MSYS_NO_PATHCONV=1 npx @wp-playground/cli@3.1.58 server --php=8.3 --port=9400 --mount-dir "$PWD" /wordpress/wp-content/plugins/spellar --blueprint=dev/playground.json
SPELLAR_WP_URL=http://127.0.0.1:9400 npx playwright test --project=wp
```

## Layout

| Path | What |
|---|---|
| `spellar.php`, `includes/`, `uninstall.php` | The plugin (PHP) |
| `assets/` | What browsers load: `spellar.js` (built from `src/`), `spellar.css`, fonts, GSAP |
| `data/` | `words.json` (answers and facts), `schedule.json` (date → word), `guesses.txt` |
| `bin/` | Data scripts, client and font builds, `deploy.sh` |
| `src/` | Client source (ES modules) |
| `dev/`, `tests/`, `docs/` | Harness and tools, tests, review material |
