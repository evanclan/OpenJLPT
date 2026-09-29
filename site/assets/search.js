// Home-page search over words, kanji and grammar (loads data/search.json on first use).
(function () {
  'use strict';
  var index = null;
  var loading = null;
  var LEVELS = ['N5', 'N4', 'N3', 'N2', 'N1'];
  var KIND = { v: ['vocab', 'word'], k: ['kanji', 'kanji'], g: ['grammar', 'grammar'] };

  function load() {
    if (!loading) {
      loading = fetch(OpenJLPT.root() + 'data/search.json')
        .then(function (r) { return r.json(); })
        .then(function (rows) {
          index = rows.map(function (r) {
            return { row: r, forms: [r[2], r[3], r[4], r[7]].join(' ').toLowerCase(), hira: OpenJLPT.toHiragana([r[2], r[3], r[7]].join(' ')), gloss: r[5].toLowerCase() };
          });
        });
    }
    return loading;
  }

  function score(item, q, qh) {
    var r = item.row;
    var exact = [r[2], r[3], r[4]].concat(r[7] ? r[7].split(' ') : []);
    for (var i = 0; i < exact.length; i++) {
      if (exact[i] && (exact[i].toLowerCase() === q || OpenJLPT.toHiragana(exact[i]) === qh)) return 100;
    }
    var glosses = item.gloss.split(/[;,] /);
    for (var j = 0; j < glosses.length; j++) {
      if (glosses[j] === q || glosses[j] === 'to ' + q) return 90;
    }
    if (item.forms.indexOf(q) === 0 || item.hira.indexOf(qh) === 0) return 60;
    if (new RegExp('\\b' + q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b').test(item.gloss)) return 50;
    if (item.forms.indexOf(q) !== -1 || item.hira.indexOf(qh) !== -1) return 30;
    if (item.gloss.indexOf(q) !== -1) return 20;
    return 0;
  }

  function esc(s) {
    return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; });
  }

  function render(q) {
    var out = document.getElementById('results');
    q = q.trim().toLowerCase().replace(/^[〜~]/, '');
    if (!q) { out.innerHTML = ''; return; }
    var qh = OpenJLPT.toHiragana(q);
    var hits = [];
    for (var i = 0; i < index.length; i++) {
      var s = score(index[i], q, qh);
      if (s) hits.push([s, LEVELS.indexOf(index[i].row[6]), i]);
    }
    hits.sort(function (a, b) { return b[0] - a[0] || a[1] - b[1] || a[2] - b[2]; });
    if (!hits.length) { out.innerHTML = '<li class="muted" style="padding:10px 12px">No results.</li>'; return; }
    out.innerHTML = hits.slice(0, 12).map(function (h) {
      var r = index[h[2]].row;
      var reading = r[0] !== 'k' && r[3] && r[3] !== r[2] ? '<span class="r">' + esc(r[3]) + '</span>' : '';
      return '<li><a href="' + KIND[r[0]][0] + '/' + r[1] + '.html"><span class="w" lang="ja">' + esc(r[2]) + reading +
        '</span><span class="m"><span class="kind">' + KIND[r[0]][1] + '</span>' + esc(r[5]) + '</span><span class="lvl ' + r[6] + '">' + r[6] + '</span></a></li>';
    }).join('');
  }

  document.addEventListener('DOMContentLoaded', function () {
    var input = document.getElementById('q');
    if (!input) return;
    var timer;
    input.addEventListener('focus', load, { once: true });
    input.addEventListener('input', function () {
      clearTimeout(timer);
      timer = setTimeout(function () { load().then(function () { render(input.value); }); }, 80);
    });
    input.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') {
        var first = document.querySelector('#results a');
        if (first) location.href = first.href;
      }
    });
    var params = new URLSearchParams(location.search);
    if (params.get('q')) { input.value = params.get('q'); load().then(function () { render(input.value); }); }
  });
})();
