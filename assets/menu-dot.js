/* Spellar menu dot: printed inline in <head> on every page; adds a red dot to the "Spellar" menu
   item (class spellar-menu-item) for new visitors, and for 7 days after the first visit on any day
   the puzzle has not been finished. It adds a style rule, not an element, so the dot is drawn with
   the menu's first paint. Must stay under 1 KB minified. */
(function () {
  try {
    var d = new Date(), p = function (n) { return (n < 10 ? '0' : '') + n; };
    var today = d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
    var s = JSON.parse(localStorage.getItem('spellar:dot') || '{}') || {};
    var show = !s.firstVisit ||
      ((Date.parse(today) - Date.parse(s.firstVisit)) / 864e5 < 7 && s.lastPlayed !== today);
    if (!show) return;
    var style = document.createElement('style');
    style.id = 'spellar-dot-style';
    style.textContent = '.spellar-menu-item>a::after{content:"";display:inline-block;flex:none;align-self:center;' +
      'width:6px;height:6px;margin-left:6px;border-radius:50%;background:#ED2839;vertical-align:middle}';
    document.head.appendChild(style);
  } catch (e) {}
})();
