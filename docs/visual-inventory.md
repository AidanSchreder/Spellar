# Visual inventory

The brief's rule: every element on screen must represent game state, or be removed. This is the
list, checked at the end of each phase against the screenshots in `docs/screens/`.

| Element | What it represents |
|---|---|
| Wordmark (SEDS + Spellar, red t over the p) | Identity. Static; the brief places it outside the motion budget. |
| Tagline | Brief-mandated text: what the answers can be. |
| Empty tile, 1.5 px outline | A letter not yet typed. |
| Typed tile, 2.5 px outline | A letter typed but not submitted. |
| Solid red tile, white letter | Right letter, right spot. |
| Hatched red band around a white square | Right letter, wrong spot. |
| Flat grey tile, grey letter | Letter not in the word. |
| Unused rows (faint, after the game) | Guesses not needed; part of the sky. |
| Legend swatches | The tile encoding itself, at small size. |
| Middle dots in the legend | Separators between the three entries (text, not decoration). |
| Keys: outline / grey / hatch / red | What the player knows about each letter (unknown, absent, wrong spot, correct). |
| Enter, Delete keys | Input actions. |
| Toast | Why a guess was refused, or that the share text was copied. |
| Scan line (Phase 4) | A guess being checked, letter by letter. |
| Faded board (14%) | The finished game, kept as the sky behind the constellation. |
| Red star with white ring | A letter position solved, on the row it was first solved. |
| Hollow red ring | A letter position never solved (loss). |
| Hairline between stars | Letter order, joining neighbouring solved positions only. |
| Answer label (spaced serif capitals) | The answer. |
| Fact | The answer's space fact. |
| Stats numbers and labels | Played, win %, streak, max streak. |
| Distribution bars | Wins by number of guesses; the filled bar is today's result. |
| Share button | Action: share the result. |
| "Next Spellar in …" | Time until the next puzzle. |
| Footer: How to play, Stats, Français | Actions. |
| Dialog frame (1.5 px outline) | A modal is open. |

Not shipped: the dark bar at the top of the harness screenshots stands in for the site's own
header so layout can be judged with it present.
