/* Spellar menu dot: printed inline on every page; adds a red dot to the "Spellar" menu item
   (class spellar-menu-item) for new visitors, and for 7 days after the first visit on any day
   the puzzle has not been finished. Must stay under 1 KB minified. */
(function () {
  try {
    var d = new Date(), p = function (n) { return (n < 10 ? '0' : '') + n; };
    var today = d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
    var s = JSON.parse(localStorage.getItem('spellar:dot') || '{}') || {};
    var show = !s.firstVisit ||
      ((Date.parse(today) - Date.parse(s.firstVisit)) / 864e5 < 7 && s.lastPlayed !== today);
    if (!show) return;
    var links = document.querySelectorAll('.spellar-menu-item > a');
    for (var i = 0; i < links.length; i++) {
      if (links[i].querySelector('.spellar-dot')) continue;
      var dot = document.createElement('span');
      dot.className = 'spellar-dot';
      dot.setAttribute('aria-hidden', 'true');
      dot.style.cssText = 'display:inline-block;width:6px;height:6px;margin-left:6px;border-radius:50%;background:#ED2839;vertical-align:middle';
      links[i].appendChild(dot);
    }
  } catch (e) {}
})();
