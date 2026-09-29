// Shared behaviour for every page: pronunciation buttons and list filters.
(function () {
  'use strict';

  // 🔊 buttons use the browser's own Japanese voice, when there is one.
  document.addEventListener('click', function (e) {
    var btn = e.target.closest && e.target.closest('[data-speak]');
    if (!btn || !('speechSynthesis' in window)) return;
    var u = new SpeechSynthesisUtterance(btn.getAttribute('data-speak'));
    u.lang = 'ja-JP';
    var voice = speechSynthesis.getVoices().find(function (v) { return /^ja/i.test(v.lang); });
    if (voice) u.voice = voice;
    speechSynthesis.cancel();
    speechSynthesis.speak(u);
  });
  document.addEventListener('DOMContentLoaded', function () {
    if (!('speechSynthesis' in window)) {
      document.querySelectorAll('[data-speak]').forEach(function (b) { b.hidden = true; });
    }

    // Self-test toggles: <input type=checkbox data-hide="r|m" data-target="#list">.
    document.querySelectorAll('[data-hide]').forEach(function (box) {
      var target = document.querySelector(box.getAttribute('data-target'));
      if (!target) return;
      box.addEventListener('change', function () {
        target.classList.toggle('hide-' + box.getAttribute('data-hide'), box.checked);
        target.querySelectorAll('.peek').forEach(function (el) { el.classList.remove('peek'); });
      });
      target.addEventListener('click', function (e) {
        var cell = e.target.closest('td.r, td.m, span.m, span.r-m');
        if (cell && (target.classList.contains('hide-r') || target.classList.contains('hide-m'))) {
          if (!e.target.closest('a') || cell.matches('span.m')) { e.preventDefault(); cell.classList.toggle('peek'); }
        }
      });
    });

    // <input data-filter="#table"> filters rows/items by their data-s text.
    document.querySelectorAll('[data-filter]').forEach(function (input) {
      var target = document.querySelector(input.getAttribute('data-filter'));
      if (!target) return;
      var rows = target.querySelectorAll('[data-s]');
      input.addEventListener('input', function () {
        var q = toHiragana(input.value.trim().toLowerCase());
        rows.forEach(function (row) {
          row.hidden = q !== '' && toHiragana(row.getAttribute('data-s')).indexOf(q) === -1;
        });
      });
    });
  });

  function toHiragana(s) {
    return s.replace(/[ァ-ヶ]/g, function (c) { return String.fromCharCode(c.charCodeAt(0) - 0x60); });
  }
  window.OpenJLPT = { toHiragana: toHiragana, root: function () { return document.body.getAttribute('data-root') || ''; } };
})();
