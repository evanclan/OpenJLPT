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
