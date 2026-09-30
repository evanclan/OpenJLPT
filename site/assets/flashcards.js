// Flashcards with a small Leitner-style spaced-repetition schedule, stored in localStorage.
(function () {
  'use strict';
  var BOXES = [0, 1, 3, 7, 16, 35]; // days until the next review, per box
  var DAY = 86400000;
  var state = { level: 'N5', kind: 'vocab', deck: [], queue: [], progress: {}, current: null, flipped: false, done: 0 };

  function storageKey() { return 'openjlpt:fc:' + state.kind + ':' + state.level; }
  function loadProgress() {
    try { return JSON.parse(localStorage.getItem(storageKey()) || '{}'); } catch (e) { return {}; }
  }
  function saveProgress() {
    try { localStorage.setItem(storageKey(), JSON.stringify(state.progress)); } catch (e) { /* private mode */ }
  }
  function esc(s) {
    return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; });
  }
  // Example sentences may carry furigana as {漢字|かんじ}; escape first, then add <ruby>.
  function ruby(s) {
    return esc(s).replace(/\{([^|{}]+)\|([^|{}]+)\}/g, '<ruby>$1<rt>$2</rt></ruby>');
  }
  function $(id) { return document.getElementById(id); }

  function start() {
    $('fc-status').textContent = 'Loading…';
    fetch(OpenJLPT.root() + 'data/' + state.kind + '-' + state.level.toLowerCase() + '.json')
      .then(function (r) { return r.json(); })
      .then(function (rows) {
        state.deck = rows;
        state.progress = loadProgress();
        var now = Date.now();
        var due = [], fresh = [];
        rows.forEach(function (row) {
          var p = state.progress[row[0]];
          if (!p) fresh.push(row);
          else if (p.due <= now) due.push(row);
        });
        shuffle(due);
        state.queue = due.concat(fresh.slice(0, Math.max(0, 20 - due.length)));
        state.done = 0;
        next();
      });
  }

  function shuffle(a) {
    for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)); var t = a[i]; a[i] = a[j]; a[j] = t; }
  }

  function learned() {
    var n = 0;
    for (var k in state.progress) if (state.progress[k].box >= 2) n++;
    return n;
  }

  function next() {
    state.flipped = false;
    $('fc-card').classList.remove('flipped');
    var total = state.done + state.queue.length;
    $('fc-bar').style.width = (total ? (state.done / total) * 100 : 100) + '%';
    $('fc-status').textContent = state.level + ' ' + ({ vocab: 'words', kanji: 'kanji', grammar: 'grammar' })[state.kind] + ' · ' +
      state.queue.length + ' to review · ' + learned() + ' / ' + state.deck.length + ' learned';
    state.current = state.queue.shift() || null;
    var row = state.current;
    if (!row) {
      $('fc-front').innerHTML = '🎉';
      $('fc-back').innerHTML = '<p>Session complete! Come back later for due reviews, or pick another deck.</p>';
      $('fc-card').classList.add('flipped');
      return;
    }
    var link = esc(OpenJLPT.root() + row[row.length - 1]);
    if (state.kind === 'vocab') {
      $('fc-front').textContent = row[1];
      $('fc-back').innerHTML = '<div class="reading">' + esc(row[2]) + ' <span class="romaji">' + esc(row[3]) + '</span></div>' +
        '<div class="meaning">' + esc(row[4]) + '</div>' +
        (row[5] ? '<div class="ex">' + ruby(row[5]) + '<br><span style="font-family:system-ui">' + esc(row[6]) + '</span></div>' : '') +
        '<p><a href="' + link + '" target="_blank" rel="noopener">details ↗</a></p>';
    } else if (state.kind === 'kanji') {
      $('fc-front').textContent = row[1];
      $('fc-back').innerHTML = '<div class="meaning">' + esc(row[4]) + '</div>' +
        '<div class="reading" style="font-size:18px">' + esc(row[2]) + (row[3] ? ' · ' + esc(row[3]) : '') + '</div>' +
        (row[5] ? '<div class="ex">' + esc(row[5]) + '</div>' : '') +
        '<p><a href="' + link + '" target="_blank" rel="noopener">details ↗</a></p>';
    } else {
      $('fc-front').textContent = row[1];
      $('fc-front').style.fontSize = 'clamp(32px, 8vw, 52px)';
      $('fc-back').innerHTML = '<div class="meaning">' + esc(row[3]) + '</div>' +
        (row[4] ? '<div class="ex">' + esc(row[4]) + '<br><span style="font-family:system-ui">' + esc(row[5]) + '</span></div>' : '') +
        '<p><a href="' + link + '" target="_blank" rel="noopener">details ↗</a></p>';
    }
    if (state.kind !== 'grammar') $('fc-front').style.fontSize = '';
  }

  function flip() {
    if (!state.current) return;
    state.flipped = !state.flipped;
    $('fc-card').classList.toggle('flipped', state.flipped);
  }

  function grade(knew) {
    var row = state.current;
    if (!row) return;
    if (!state.flipped) { flip(); return; }
    var p = state.progress[row[0]] || { box: 0, due: 0 };
    p.box = knew ? Math.min(p.box + 1, BOXES.length - 1) : 0;
    p.due = Date.now() + BOXES[p.box] * DAY;
    state.progress[row[0]] = p;
    saveProgress();
    if (!knew) state.queue.splice(Math.min(3, state.queue.length), 0, row); // see it again soon
    else state.done++;
    next();
  }

  function segment(id, key) {
    var group = $(id);
    group.addEventListener('click', function (e) {
      var b = e.target.closest('button');
      if (!b) return;
      group.querySelectorAll('button').forEach(function (x) { x.setAttribute('aria-pressed', String(x === b)); });
      state[key] = b.getAttribute('data-v');
      start();
    });
  }

  document.addEventListener('DOMContentLoaded', function () {
    var hash = location.hash.slice(1).toUpperCase();
    if (/^N[1-5]$/.test(hash)) {
      state.level = hash;
      $('fc-level').querySelectorAll('button').forEach(function (b) { b.setAttribute('aria-pressed', String(b.getAttribute('data-v') === hash)); });
    }
    segment('fc-level', 'level');
    segment('fc-kind', 'kind');
    $('fc-card').addEventListener('click', flip);
    $('fc-flip').addEventListener('click', flip);
    $('fc-again').addEventListener('click', function () { grade(false); });
    $('fc-good').addEventListener('click', function () { grade(true); });
    $('fc-reset').addEventListener('click', function () {
      if (confirm('Reset progress for this deck?')) { state.progress = {}; saveProgress(); start(); }
    });
    document.addEventListener('keydown', function (e) {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
      if (e.key === ' ') { e.preventDefault(); flip(); }
      else if (e.key === '1') grade(false);
      else if (e.key === '2') grade(true);
    });
    start();
  });
})();
