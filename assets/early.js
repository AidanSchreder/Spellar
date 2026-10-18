/* Spellar: start fetching today's puzzle while the page is still loading (printed inline after the root element). */
(function () {
  try {
    var root = document.getElementById('spellar-root');
    if (!root || !window.fetch) return;
    var d = new Date(), p = function (n) { return (n < 10 ? '0' : '') + n; };
    var date = d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
    var saved = null;
    try { saved = JSON.parse(localStorage.getItem('spellar:v1')); } catch (e) {}
    if (saved && saved.puzzle && saved.puzzle.date === date) return;
    var puzzle = fetch(root.getAttribute('data-api') + 'puzzle?date=' + date, { credentials: 'omit' })
      .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); });
    puzzle['catch'](function () {});
    window.spellarEarly = { date: date, puzzle: puzzle };
  } catch (e) {}
})();
