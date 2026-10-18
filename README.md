# Spellar

A daily space word puzzle for [seds.ca/spellar](https://www.seds.ca/spellar/), built for SEDS Canada
(Students for the Exploration and Development of Space).

One answer a day, the same for every player, 4 to 7 letters long. Every answer comes with a
one-sentence space fact, and a solved puzzle draws a constellation from the player's own guesses.

It is a small WordPress plugin: the `[spellar]` shortcode renders the game, two REST routes serve
the day's puzzle and count anonymous plays, and the content lives in `data/` as plain files.

Work in progress; see `CLAUDE.md` (maintenance) and `DECISIONS.md` (decision log).
