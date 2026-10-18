/* Spellar: printed inline straight after the root element. The page normally carries today's
   puzzle (data-days); when it does not (an old saved copy of the page), start fetching it now.
   Then start the game if its script, which loads async, arrived before the root was parsed. */
(function () {
  try {
    var root = document.getElementById('spellar-root');
    var d = new Date(), p = function (n) { return (n < 10 ? '0' : '') + n; };
    var date = d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
    var days = JSON.parse(root.getAttribute('data-days') || '{}') || {};
    var saved = null;
    try { saved = JSON.parse(localStorage.getItem('spellar:v1')); } catch (e) {}
    var known = days[date] || (saved && saved.puzzle && saved.puzzle.date === date);
    if (!known && !root.getAttribute('data-mounted') && window.fetch) {
      var puzzle = fetch(root.getAttribute('data-api') + 'puzzle?date=' + date, { credentials: 'omit' })
        .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); });
      puzzle['catch'](function () {});
      window.spellarEarly = { date: date, puzzle: puzzle };
    }
  } catch (e) {}
  if (window.spellarBoot) window.spellarBoot();
})();
