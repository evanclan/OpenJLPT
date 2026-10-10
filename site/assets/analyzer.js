// Colour every kanji in a text by its JLPT level and summarise the mix.
(function () {
  'use strict';
  var LEVELS = ['N5', 'N4', 'N3', 'N2', 'N1'];
  var levels = null;
  var KANJI = /[㐀-䶿一-鿿豈-﫿々]/;

  function esc(s) {
    return s.replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; });
  }

  function analyze() {
    var text = document.getElementById('text').value;
    var counts = { N5: 0, N4: 0, N3: 0, N2: 0, N1: 0, none: 0 };
    var unique = {};
    var html = '';
    var root = OpenJLPT.root();
    for (var i = 0; i < text.length; i++) {
      var ch = text[i];
      if (!KANJI.test(ch)) { html += esc(ch); continue; }
      var lvl = levels[ch] || 'none';
      if (!unique[ch]) { unique[ch] = true; counts[lvl]++; }
      html += lvl === 'none'
        ? '<span class="k-none" title="未收录于 JLPT 汉字表">' + esc(ch) + '</span>'
        : '<a class="k-' + lvl + '" href="' + root + 'kanji/' + encodeURIComponent(ch) + '.html" title="' + lvl + '">' + esc(ch) + '</a>';
    }
    document.getElementById('marked').innerHTML = html || '<span class="muted">请在上方粘贴日文。</span>';

    var total = 0;
    for (var k in counts) total += counts[k];
    var bar = '';
    LEVELS.concat(['none']).forEach(function (l) {
      if (counts[l]) bar += '<span style="width:' + (counts[l] / total) * 100 + '%;background:var(--' + (l === 'none' ? 'none' : l.toLowerCase()) + ')" title="' + l + ': ' + counts[l] + '"></span>';
    });
    document.getElementById('bar').innerHTML = bar;

    if (!total) { document.getElementById('summary').textContent = '没有找到汉字。'; return; }
    // Smallest level that covers at least 90% of the distinct kanji.
    var covered = 0, estimate = 'N1+';
    for (var j = 0; j < LEVELS.length; j++) {
      covered += counts[LEVELS[j]];
      if (covered / total >= 0.9) { estimate = LEVELS[j]; break; }
    }
    document.getElementById('summary').innerHTML = '<strong>' + total + '</strong> 个不同汉字 · ' +
      LEVELS.map(function (l) { return l + '：' + counts[l]; }).join(' · ') + ' · 其他：' + counts.none +
      '<br>汉字等级：<strong>' + estimate + '</strong> <span class="muted">（覆盖 90% 汉字的最低 JLPT 等级）</span>';
  }

  function shareUrl() {
    var url = new URL(location.href);
    url.search = '';
    url.hash = '';
    url.searchParams.set('t', document.getElementById('text').value.slice(0, 1500));
    return url.toString();
  }

  document.addEventListener('DOMContentLoaded', function () {
    var input = document.getElementById('text');
    var shared = new URLSearchParams(location.search).get('t');
    if (shared) input.value = shared;
    var share = document.getElementById('share');
    if (share) {
      share.addEventListener('click', function () {
        var url = shareUrl();
        history.replaceState(null, '', url);
        if (navigator.clipboard) {
          navigator.clipboard.writeText(url).then(function () {
            share.textContent = '✓ 链接已复制';
            setTimeout(function () { share.textContent = '🔗 复制分析链接'; }, 2000);
          });
        }
      });
    }
    fetch(OpenJLPT.root() + 'data/kanji-levels.json')
      .then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status + ' while loading kanji level data.');
        return r.json();
      })
      .then(function (data) {
        levels = data;
        var t;
        input.addEventListener('input', function () { clearTimeout(t); t = setTimeout(analyze, 120); });
        analyze();
      })
      .catch(function (err) {
        document.getElementById('summary').textContent = '汉字等级数据加载失败，请刷新页面后重试。';
        console.error('OpenJLPT kanji level data failed to load:', err);
      });
  });
})();
