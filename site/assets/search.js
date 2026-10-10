// Home-page search over words, kanji and grammar (loads data/search.json on first use).
(function () {
  'use strict';
  var index = null;
  var loading = null;
  var LEVELS = ['N5', 'N4', 'N3', 'N2', 'N1'];
  var KIND = { v: '单词', k: '汉字', g: '语法' };
  var activeKind = 'v';

  function load() {
    if (!loading) {
      loading = fetch(OpenJLPT.root() + 'data/search.json')
        .then(function (r) {
          if (!r.ok) throw new Error('HTTP ' + r.status + ' while loading data/search.json');
          return r.json();
        })
        .then(function (rows) {
          index = rows.map(function (r) {
            return { row: r, romaji: r[4], forms: [r[2], r[3], r[7]].join(' ').toLowerCase(), hira: OpenJLPT.toHiragana([r[2], r[3], r[7]].join(' ')), gloss: r[5].toLowerCase(), chinese: (r[8] || '').toLowerCase() };
          });
        })
        .catch(function (err) {
          loading = null;
          throw err;
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
    var glosses = item.gloss.split(/[;,] /).concat(item.chinese.split(/[;,，；、] */));
    if (item.chinese.indexOf(q) !== -1) return 70;
    for (var j = 0; j < glosses.length; j++) {
      if (glosses[j] === q || glosses[j] === 'to ' + q) return 90;
    }
    if (item.forms.indexOf(q) === 0 || item.hira.indexOf(qh) === 0 || (item.romaji && item.romaji.indexOf(q) === 0)) return 60;
    if (new RegExp('\\b' + q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b').test(item.gloss)) return 50;
    if (item.forms.indexOf(q) !== -1 || item.hira.indexOf(qh) !== -1) return 30;
    // Glosses match at word starts only: "eat" finds "eating", not "treatment" or "great".
    if (new RegExp('\\b' + q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).test(item.gloss)) return 20;
    return 0;
  }

  function esc(s) {
    return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; });
  }

  function render(q) {
    var out = document.getElementById('results');
    q = q.trim().toLowerCase().replace(/^[〜~]/, '');
    var caption = document.getElementById('result-caption');
    if (!q) {
      out.innerHTML = '';
      if (caption) caption.textContent = '输入关键词，搜索日语词汇、汉字或语法';
      return;
    }
    var qh = OpenJLPT.toHiragana(q);
    var hits = [];
    for (var i = 0; i < index.length; i++) {
      if (activeKind !== 'all' && index[i].row[0] !== activeKind) continue;
      var s = score(index[i], q, qh);
      if (s) hits.push([s, LEVELS.indexOf(index[i].row[6]), i]);
    }
    hits.sort(function (a, b) { return b[0] - a[0] || a[1] - b[1] || a[2] - b[2]; });
    if (caption) caption.textContent = hits.length ? '搜索结果 · ' + hits.length + ' 条' : '没有找到匹配词条，请尝试其他关键词';
    if (!hits.length) { out.innerHTML = '<li class="muted result-empty">没有找到匹配词条，请尝试其他关键词。</li>'; return; }
    out.innerHTML = hits.slice(0, 12).map(function (h) {
      var r = index[h[2]].row;
      var reading = r[0] !== 'k' && r[3] && r[3] !== r[2] ? '<span class="r">' + esc(r[3]) + '</span>' : '';
      return '<li><a href="' + esc(OpenJLPT.root() + r[1]) + '"><span class="w" lang="ja">' + esc(r[2]) + reading +
        '</span><span class="m"><span class="kind">' + KIND[r[0]] + '</span>' + esc(r[5]) + (r[8] ? '<span class="search-zh" lang="zh-CN">' + esc(r[8]) + '</span>' : '') + '</span><span class="lvl ' + r[6] + '">' + r[6] + '</span></a></li>';
    }).join('');
  }

  document.addEventListener('DOMContentLoaded', function () {
    var input = document.getElementById('q');
    if (!input) return;
    var timer;
    var tabs = document.querySelector('.search-tabs');
    if (tabs) tabs.addEventListener('click', function (e) {
      var button = e.target.closest('button[data-kind]');
      if (!button) return;
      activeKind = button.getAttribute('data-kind');
      tabs.querySelectorAll('button').forEach(function (tab) {
        tab.setAttribute('aria-pressed', String(tab === button));
      });
      if (index) render(input.value);
      else if (input.value.trim()) searchAndRender(input);
    });
    document.querySelectorAll('[data-query]').forEach(function (button) {
      button.addEventListener('click', function () {
        input.value = button.getAttribute('data-query');
        searchAndRender(input);
        input.focus();
      });
    });
    var submit = document.querySelector('.search-submit');
    if (submit) submit.addEventListener('click', function () {
      searchAndRender(input);
      input.focus();
    });
    input.addEventListener('focus', function () {
      load().catch(function (err) { showLoadError(err); });
    }, { once: true });
    input.addEventListener('input', function () {
      clearTimeout(timer);
      timer = setTimeout(function () { searchAndRender(input); }, 80);
    });
    input.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') {
        var first = document.querySelector('#results a');
        if (first) location.href = first.href;
      }
    });
    var params = new URLSearchParams(location.search);
    if (params.get('q')) {
      input.value = params.get('q');
      searchAndRender(input);
    }
  });

  function showLoadError(err) {
    var caption = document.getElementById('result-caption');
    if (caption) caption.textContent = '词典数据加载失败，请刷新页面后重试。';
    console.error('OpenJLPT search index failed to load:', err);
  }

  function searchAndRender(input) {
    load().then(function () { render(input.value); }).catch(showLoadError);
  }
})();
