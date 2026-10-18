# Motion review

How the motion moments were checked. Frames come from `node dev/frames.mjs`, which plays the real
game with Playwright's fake clock (it also fakes `requestAnimationFrame`, so GSAP is stepped
exactly) and saves contact sheets as `docs/screens/motion-<moment>-<mobile|desktop>.png`, at
375×812 and 1280×800. `node dev/frames.mjs --video` also records a whole game in real time to
`dev/out/recordings/` (not committed). `dev/sandbox.html` scrubs each timeline with GSDevTools.
`tests/e2e/motion.spec.mjs` checks what can be measured.

| Moment | Brief | As built |
|---|---|---|
| Letter pop | 1 → 1.06 → 1, 100 ms, power1.out; outline to 2.5 px | Same; the outline changes with the typed state. |
| Reveal | Brief: a scan line with flips. Replaced 2026-10-18 at Aidan's request by a star | Tiles 150 ms apart; on each, a copy in the new state clipped to a star grows from the centre, turning −36° → 0°, until it covers the tile (420 ms, power2.in); wrong-spot copies start fully hatched and open their white square (160 ms, power2.out); keys update after the row. A 7-letter row takes about 1.5 s. |
| Invalid shake | ±6 px, five times, 300 ms; toast 1.5 s | Five swings (−6, +6, −6, +6, −6, back to 0), sine between keyframes. |
| Title swap | Not in the brief (it kept the wordmark static); added 2026-10-18 at Aidan's request | 5 s after opening, then every 25–45 s while visible: p fades out (315 ms, sine.in) as t fades in (from 135 ms, sine.out) and the slot narrows to the t (450 ms, power2.inOut); holds 1.6 s; reverses. Never with reduced motion. |
| Constellation | 300 ms pause; tiles to ~14% in 400 ms; stars pop 0→1 in 180 ms back.out(2), 120 ms apart; hairline per segment ~250 ms power1.inOut as each star lands; label letter-spacing tight → final with opacity over 500 ms; then fact, then panel; ≤ 3.5 s for 7 letters; a tap skips | Same values. 7 letters: about 2.2–2.6 s from the last flip to the full results; 5 letters about 1.8 s. |

## Pass 1

- **Pop**: peak at 50 ms, settled at 100 ms; reads as a press, not a bounce. No change.
- **Reveal**: line and flips in step with each tile's centre; the state appears at the sliver.
  No change to the motion. Added `aria-busy` on the board while a row is revealed (input is
  locked then), which screen readers use and the tests wait on.
- **Shake**: the "Not in word list" toast sat over the row being shaken and hid its tiles.
  Moved the toast above the board, over the tagline.
- **Constellation**: in the sandbox, the finished layout (stars, label, fact) could show for one
  frame before the sequence started, because the starting states were set inside the timeline
  and only applied on its first tick. They are now applied immediately. Also found: the skip
  only listened for taps inside the game (the brief says anywhere; now the whole page), and
  DrawSVG's dash lengths stayed on the lines afterwards, which a later resize could cut short
  (now cleared when the sequence ends).

## Pass 2

- All four sheets regenerated at both sizes, plus the real-time recordings, checked frame by frame.
- **Pop, reveal**: unchanged and correct at 1280×800 (larger tiles, same timing).
- **Shake**: the row is fully visible through all five swings; the toast sits over the tagline.
- **Constellation**: stars in letter order, each hairline growing from the previous star to the
  one that has just landed; the label tightens into its spacing; fact and results follow. No
  jitter, nothing overlaps text. On a loss, rings sit on the last row and the line stops at
  them, leaving gaps.
- Measured (`motion.spec.mjs`): every star centre within 0.75 px of its tile centre and every
  hairline end on a star centre, at 375 px and 1280 px, after resizing to 340 px and 900 px, and
  after toggling the review view; a tap ends the sequence at once; with reduced motion nothing
  is scaled or dashed and the end state is drawn in full immediately.

One deliberate cut: when the game ends, the keyboard and legend are removed at once (no
animation, which the brief does not allow beyond the four moments), so the board stands alone
for the constellation and the results set in below it.

## Pass 3 (2026-10-18, after the first play-through)

- **Reveal**: first version clipped every tile's new state to a growing star. On red and grey
  tiles the star read well; on wrong-spot tiles it was invisible until it reached the hatched
  band, because those tiles are white in the middle. Their copy now starts fully hatched, so the
  star shows as a hatched star, and the white square opens once the tile is covered. Checked at
  both sizes, every 50 ms (`motion-reveal-*.png`).
- **Title swap**: checked every 100 ms (`motion-title-*.png`): "Spellar" eases into "Stellar"
  with the letters closing up, holds, and turns back; nothing else in the header moves except
  the word re-centring by half the width change.
- `motion.spec.mjs` checks that each reveal cover is clipped to a ten-cornered polygon, is
  hidden from screen readers and is gone when the row is done; that the title swaps at 5 s and
  is back by 8 s; and, with reduced motion, that there is no cover and the t never shows.

