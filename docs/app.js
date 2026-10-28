// 急落株チェック — 画面
(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var S = { meta: null, today: null, history: [], stats: null, sort: 'score', charts: {}, notes: loadNotes() };

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function fmt(n, d) { return n == null || isNaN(n) ? '−' : Number(n).toLocaleString('ja-JP', { maximumFractionDigits: d == null ? 0 : d, minimumFractionDigits: d == null ? 0 : d }); }
  function pct(n, d) { return n == null || isNaN(n) ? '−' : (n > 0 ? '+' : '') + Number(n).toFixed(d == null ? 1 : d) + '%'; }
  function chgCls(n) { return n == null ? 'flat' : n < 0 ? 'dn' : n > 0 ? 'up' : 'flat'; }
  function md(s) { return s ? (+s.slice(5, 7)) + '/' + (+s.slice(8, 10)) : ''; }
  function ymdJa(s) { return s ? s.slice(0, 4) + '/' + (+s.slice(5, 7)) + '/' + (+s.slice(8, 10)) : ''; }
  function oku(n) { return n == null ? '−' : n >= 1e8 ? (n / 1e8).toFixed(n >= 1e9 ? 0 : 1) + '億' : (n / 1e4).toFixed(0) + '万'; }
  function toast(m) { var t = $('toast'); t.textContent = m; t.style.display = 'block'; clearTimeout(t._t); t._t = setTimeout(function () { t.style.display = 'none'; }, 2200); }
  function loadNotes() { try { return JSON.parse(localStorage.getItem('kabu-notes') || '{}'); } catch (e) { return {}; } }
  function saveNotes() { try { localStorage.setItem('kabu-notes', JSON.stringify(S.notes)); } catch (e) {} }
  function noteKey(e) { return e.date + ':' + e.code; }
  function tagCls(t) { return /飛びつき|ギャップ|続落|安値|25日線/.test(t) ? 'hot' : /出来高/.test(t) ? 'vol' : /売られすぎ|下ヒゲ/.test(t) ? 'cold' : ''; }
  function catHtml(c) { return '<span class="cat c-' + esc(c) + '">' + esc(c) + '</span>'; }
  function links(code) {
    return [['Yahoo', 'https://finance.yahoo.co.jp/quote/' + code + '.T'], ['みんかぶ', 'https://minkabu.jp/stock/' + code], ['株探', 'https://kabutan.jp/stock/?code=' + code], ['株探ニュース', 'https://kabutan.jp/stock/news?code=' + code], ['適時開示', 'https://www.release.tdnet.info/inbs/I_main_00.html']]
      .map(function (l) { return '<a href="' + l[1] + '" target="_blank" rel="noopener">' + l[0] + ' ↗</a>'; }).join('');
  }
  function verdictHtml(e) { var n = S.notes[noteKey(e)]; if (!n || !n.v) return ''; var lab = { go: '狙う', watch: '様子見', skip: '見送り' }[n.v]; return '<span class="vd ' + n.v + '">' + lab + '</span>'; }

  // ---------- 読み込み ----------
  function get(p) { return fetch(p + '?t=' + Date.now()).then(function (r) { if (!r.ok) throw new Error(p); return r.json(); }); }
  Promise.all([get('data/meta.json'), get('data/today.json'), get('data/history.json').catch(function () { return []; }), get('data/stats.json').catch(function () { return null; })])
    .then(function (r) {
      S.meta = r[0]; S.today = r[1]; S.history = r[2]; S.stats = r[3];
      $('meta').innerHTML = '相場日 <b>' + ymdJa(S.meta.date) + '</b> ／ 更新 ' + esc(S.meta.generatedAt) + '<br>プライム ' + fmt(S.meta.universe) + ' 銘柄 ／ しきい値 ' + S.meta.threshold + '%';
      $('nToday').textContent = S.today.picks.length;
      $('nHistory').textContent = S.history.length;
      buildFilters();
      renderToday(); renderHistory(); renderPatterns();
      var hash = location.hash.replace('#', '');
      if (['today', 'history', 'patterns'].indexOf(hash) >= 0) showTab(hash);
    }).catch(function (e) { $('cards').innerHTML = '<div class="empty">データを読み込めませんでした（' + esc(e.message) + '）</div>'; });

  // ---------- タブ ----------
  $('tabs').onclick = function (e) { var b = e.target.closest('button'); if (b) showTab(b.dataset.tab); };
  function showTab(tab) {
    document.querySelectorAll('#tabs button').forEach(function (b) { b.classList.toggle('on', b.dataset.tab === tab); });
    ['today', 'history', 'patterns'].forEach(function (id) { $(id).classList.toggle('hide', id !== tab); });
    history.replaceState(null, '', '#' + tab);
  }

  // ---------- 今日 ----------
  function buildFilters() {
    var cats = {}, tags = {};
    S.today.picks.forEach(function (p) { cats[p.cat] = 1; (p.tags || []).forEach(function (t) { tags[t] = 1; }); });
    Object.keys(cats).sort().forEach(function (c) { $('catFilter').insertAdjacentHTML('beforeend', '<option>' + esc(c) + '</option>'); });
    Object.keys(tags).sort().forEach(function (t) { $('tagFilter').insertAdjacentHTML('beforeend', '<option>' + esc(t) + '</option>'); });
    var hc = {};
    S.history.forEach(function (e) { hc[e.cat] = 1; });
    Object.keys(hc).sort().forEach(function (c) { $('hCat').insertAdjacentHTML('beforeend', '<option>' + esc(c) + '</option>'); });
  }
  $('sortSeg').onclick = function (e) { var b = e.target.closest('button'); if (!b) return; S.sort = b.dataset.k; document.querySelectorAll('#sortSeg button').forEach(function (x) { x.classList.toggle('on', x === b); }); renderToday(); };
  $('catFilter').onchange = renderToday; $('tagFilter').onchange = renderToday;

  function renderToday() {
    var picks = S.today.picks.slice(), cat = $('catFilter').value, tag = $('tagFilter').value;
    if (cat) picks = picks.filter(function (p) { return p.cat === cat; });
    if (tag) picks = picks.filter(function (p) { return (p.tags || []).indexOf(tag) >= 0; });
    var k = S.sort;
    picks.sort(function (a, b) { return k === 'chg' ? a.chg - b.chg : k === 'volRatio' ? (b.volRatio || 0) - (a.volRatio || 0) : k === 'turnover' ? (b.turnover || 0) - (a.turnover || 0) : b.score - a.score; });
    var all = S.today.picks;
    var avg = all.length ? all.reduce(function (s, p) { return s + p.chg; }, 0) / all.length : null;
    var jump = all.filter(function (p) { return (p.tags || []).indexOf('飛びつき後の急落') >= 0; }).length;
    var vol = all.filter(function (p) { return (p.volRatio || 0) >= 3; }).length;
    var tot = S.stats && S.stats.total;
    $('kpis').innerHTML =
      '<div class="kpi"><div class="l">今日の急落（' + S.today.threshold + '%以下）</div><div class="v red">' + all.length + '<small>銘柄</small></div></div>' +
      '<div class="kpi"><div class="l">平均下落率</div><div class="v red">' + pct(avg) + '</div></div>' +
      '<div class="kpi"><div class="l">飛びつき後の急落</div><div class="v amber">' + jump + '<small>銘柄</small></div></div>' +
      '<div class="kpi"><div class="l">出来高3倍以上</div><div class="v amber">' + vol + '<small>銘柄</small></div></div>' +
      '<div class="kpi"><div class="l">過去の翌日プラス率</div><div class="v green">' + (tot && tot.up1Rate != null ? tot.up1Rate + '<small>%（' + tot.n + '件）</small>' : '−') + '</div></div>' +
      '<div class="kpi"><div class="l">過去の5日後プラス率</div><div class="v green">' + (tot && tot.up5Rate != null ? tot.up5Rate + '<small>%（' + tot.n5 + '件）</small>' : '−') + '</div></div>';
    $('todayHint').textContent = picks.length + ' / ' + all.length + ' 銘柄を表示。カードをクリックで詳細';
    $('cards').innerHTML = picks.length ? picks.map(card).join('') : '<div class="empty">' + (all.length ? '条件に合う銘柄はありません' : 'この日は ' + S.today.threshold + '% 以下の急落はありませんでした') + '</div>';
    picks.forEach(function (p) { loadChart(p.code).then(function (h) { var el = document.querySelector('#spark-' + p.code); if (el && h) el.innerHTML = sparkline(h, p.date); }); });
  }
  function card(p) {
    var news = (p.news || []).slice(0, 3);
    return '<div class="card" data-code="' + esc(p.code) + '" data-date="' + esc(p.date) + '">' +
      '<div class="vdmark">' + verdictHtml(p) + '</div>' +
      '<div class="head"><div><div class="code">' + esc(p.code) + ' · ' + esc(p.sector17 || p.sector33) + '</div><div class="name">' + esc(p.name) + '</div><div class="sector">' + catHtml(p.cat) + '</div></div>' +
      '<div class="big"><div class="chg dn">' + pct(p.chg) + '</div><div class="px">' + fmt(p.close) + ' 円 <span style="color:var(--faint)">← ' + fmt(p.prevClose) + '</span></div></div></div>' +
      '<div class="spark" id="spark-' + esc(p.code) + '"></div>' +
      '<div class="stats">' +
        '<div class="stat"><span>出来高倍率</span><b>' + (p.volRatio != null ? p.volRatio.toFixed(1) + 'x' : '−') + '</b></div>' +
        '<div class="stat"><span>ギャップ</span><b class="chg ' + chgCls(p.gap) + '">' + pct(p.gap) + '</b></div>' +
        '<div class="stat"><span>直前5日</span><b class="chg ' + chgCls(p.runUp5) + '">' + pct(p.runUp5) + '</b></div>' +
        '<div class="stat"><span>RSI / 25日線</span><b>' + (p.rsi14 != null ? p.rsi14.toFixed(0) : '−') + ' / ' + pct(p.ma25dev, 0) + '</b></div>' +
      '</div>' +
      '<div class="tags">' + (p.tags || []).map(function (t) { return '<span class="tag ' + tagCls(t) + '">' + esc(t) + '</span>'; }).join('') + '<span class="tag">売買代金 ' + oku(p.avgTurnover20) + '/日</span></div>' +
      (news.length ? '<ul class="news">' + news.map(function (n) { return '<li><span class="d">' + md(n.date.slice(0, 10)) + '</span><span><a href="' + esc(n.link) + '" target="_blank" rel="noopener">' + esc(n.title) + '</a><span class="src">' + esc(n.source) + '</span></span></li>'; }).join('') + '</ul>' : '<div class="note">直近7日のニュースは見つかりませんでした。適時開示や株探ニュースで確認してください。</div>') +
      '<div class="links">' + links(p.code) + '</div></div>';
  }
  $('cards').onclick = function (e) {
    if (e.target.closest('a')) return;
    var c = e.target.closest('.card'); if (!c) return;
    var p = S.today.picks.filter(function (x) { return x.code === c.dataset.code; })[0];
    var h = S.history.filter(function (x) { return x.code === c.dataset.code && x.date === c.dataset.date; })[0];
    openDetail(h || p);
  };

  // ---------- チャート ----------
  function loadChart(code) {
    if (S.charts[code]) return Promise.resolve(S.charts[code]);
    return get('data/stocks/' + code + '.json').then(function (h) { S.charts[code] = h; return h; }).catch(function () { return null; });
  }
  // 60日のスパークライン（急落日を赤い点で）
  function sparkline(h, date) {
    var n = Math.min(60, h.c.length), c = h.c.slice(-n), dates = h.dates.slice(-n);
    var W = 340, H = 64, pad = 4, min = Math.min.apply(null, c), max = Math.max.apply(null, c), rng = max - min || 1;
    var x = function (i) { return pad + i * (W - pad * 2) / (n - 1); }, y = function (v) { return H - pad - (v - min) / rng * (H - pad * 2); };
    var d = c.map(function (v, i) { return (i ? 'L' : 'M') + x(i).toFixed(1) + ',' + y(v).toFixed(1); }).join('');
    var i0 = dates.indexOf(date), last = c[c.length - 1], first = c[0];
    var col = last >= first ? '#2ee6a6' : '#ff4d6d';
    var m25 = ''; if (h.c.length >= 25) { var pts = []; for (var i = 0; i < n; i++) { var idx = h.c.length - n + i; if (idx >= 24) { var s = 0; for (var k = idx - 24; k <= idx; k++) s += h.c[k]; pts.push((pts.length ? 'L' : 'M') + x(i).toFixed(1) + ',' + y(s / 25).toFixed(1)); } } m25 = '<path d="' + pts.join('') + '" fill="none" stroke="#9b7bff" stroke-width="1" stroke-dasharray="3 3" opacity=".8"/>'; }
    return '<svg viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="none"><defs><linearGradient id="g' + h.code + '" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="' + col + '" stop-opacity=".35"/><stop offset="1" stop-color="' + col + '" stop-opacity="0"/></linearGradient></defs>' +
      '<path d="' + d + 'L' + x(n - 1).toFixed(1) + ',' + H + 'L' + x(0).toFixed(1) + ',' + H + 'Z" fill="url(#g' + h.code + ')"/>' + m25 +
      '<path d="' + d + '" fill="none" stroke="' + col + '" stroke-width="1.6"/>' +
      (i0 >= 0 ? '<circle cx="' + x(i0).toFixed(1) + '" cy="' + y(c[i0]).toFixed(1) + '" r="3.5" fill="#ff4d6d" stroke="#0f172a" stroke-width="1.5"/>' : '') + '</svg>';
  }
  // その後5日のミニ折れ線（記録の一覧）
  function miniFwd(e) {
    if (!e.fwd || !e.fwd.length) return '<span class="hint">追跡前</span>';
    var pts = [0].concat(e.fwd.map(function (f) { return f.chg; })), W = 110, H = 30, min = Math.min.apply(null, pts.concat([0])), max = Math.max.apply(null, pts.concat([0])), rng = max - min || 1;
    var x = function (i) { return 3 + i * (W - 6) / 5; }, y = function (v) { return H - 3 - (v - min) / rng * (H - 6); };
    var d = pts.map(function (v, i) { return (i ? 'L' : 'M') + x(i).toFixed(1) + ',' + y(v).toFixed(1); }).join('');
    var last = pts[pts.length - 1], col = last > 0 ? '#2ee6a6' : last < 0 ? '#ff4d6d' : '#8b9bb4';
    return '<svg class="mini" viewBox="0 0 ' + W + ' ' + H + '"><line x1="3" x2="' + (W - 3) + '" y1="' + y(0).toFixed(1) + '" y2="' + y(0).toFixed(1) + '" stroke="#334155" stroke-dasharray="2 2"/><path d="' + d + '" fill="none" stroke="' + col + '" stroke-width="1.6"/>' +
      pts.map(function (v, i) { return '<circle cx="' + x(i).toFixed(1) + '" cy="' + y(v).toFixed(1) + '" r="1.8" fill="' + col + '"/>'; }).join('') + '</svg>';
  }
  // ローソク足（90日）＋出来高＋25日線。急落日に印
  function drawCandles(cv, h, date) {
    var dpr = window.devicePixelRatio || 1, W = cv.clientWidth, H = cv.clientHeight;
    cv.width = W * dpr; cv.height = H * dpr;
    var g = cv.getContext('2d'); g.scale(dpr, dpr);
    var n = h.c.length, padL = 44, padR = 10, padT = 12, volH = 50, padB = 24;
    var cw = (W - padL - padR) / n, bw = Math.max(1.5, cw * 0.6);
    var lo = Math.min.apply(null, h.l), hi = Math.max.apply(null, h.h), rng = hi - lo || 1;
    var ph = H - padT - padB - volH;
    var y = function (v) { return padT + (hi - v) / rng * ph; }, x = function (i) { return padL + i * cw + cw / 2; };
    var vmax = Math.max.apply(null, h.v) || 1;
    // 目盛り
    g.strokeStyle = 'rgba(148,163,184,.12)'; g.fillStyle = '#5b6b85'; g.font = '10px JetBrains Mono, monospace'; g.textAlign = 'right';
    for (var k = 0; k <= 4; k++) { var v = lo + rng * k / 4, yy = y(v); g.beginPath(); g.moveTo(padL, yy); g.lineTo(W - padR, yy); g.stroke(); g.fillText(Math.round(v).toLocaleString(), padL - 6, yy + 3); }
    // 月の境目
    g.textAlign = 'left';
    h.dates.forEach(function (d, i) { if (d.slice(8) === '01' || (i && d.slice(5, 7) !== h.dates[i - 1].slice(5, 7))) { g.strokeStyle = 'rgba(148,163,184,.18)'; g.beginPath(); g.moveTo(x(i), padT); g.lineTo(x(i), H - padB); g.stroke(); g.fillStyle = '#8b9bb4'; g.fillText((+d.slice(5, 7)) + '月', x(i) + 3, H - padB + 14); } });
    // 出来高
    h.v.forEach(function (v, i) { var bh = v / vmax * volH; g.fillStyle = h.c[i] >= h.o[i] ? 'rgba(46,230,166,.35)' : 'rgba(255,77,109,.35)'; g.fillRect(x(i) - bw / 2, H - padB - bh, bw, bh); });
    // 25日線
    if (n >= 25) { g.strokeStyle = '#9b7bff'; g.lineWidth = 1.2; g.beginPath(); for (var i = 24; i < n; i++) { var s = 0; for (var j = i - 24; j <= i; j++) s += h.c[j]; var py = y(s / 25); if (i === 24) g.moveTo(x(i), py); else g.lineTo(x(i), py); } g.stroke(); }
    // ローソク
    h.c.forEach(function (c, i) {
      var up = c >= h.o[i], col = up ? '#2ee6a6' : '#ff4d6d';
      g.strokeStyle = col; g.fillStyle = up ? 'rgba(46,230,166,.85)' : '#ff4d6d'; g.lineWidth = 1;
      g.beginPath(); g.moveTo(x(i), y(h.h[i])); g.lineTo(x(i), y(h.l[i])); g.stroke();
      var top = y(Math.max(c, h.o[i])), bot = y(Math.min(c, h.o[i]));
      g.fillRect(x(i) - bw / 2, top, bw, Math.max(1, bot - top));
    });
    // 急落日
    var i0 = h.dates.indexOf(date);
    if (i0 >= 0) { g.strokeStyle = '#ffb648'; g.setLineDash([4, 3]); g.beginPath(); g.moveTo(x(i0), padT); g.lineTo(x(i0), H - padB); g.stroke(); g.setLineDash([]); g.fillStyle = '#ffb648'; g.font = 'bold 10px JetBrains Mono, monospace'; g.textAlign = 'center'; g.fillText('急落 ' + md(date), x(i0), padT - 2); }
  }

  // ---------- 詳細 ----------
  function openDetail(e) {
    var key = noteKey(e), note = S.notes[key] || {};
    $('mBody').innerHTML =
      '<div class="mhead"><div><div class="code mono" style="font-size:11px;color:var(--faint)">' + esc(e.code) + ' · ' + esc(e.sector33 || '') + ' · ' + esc(e.size || '') + '</div><h2>' + esc(e.name) + '</h2>' +
        '<div class="sub">' + catHtml(e.cat) + '<span>急落日 ' + ymdJa(e.date) + '</span>' + (e.result ? '<span class="res ' + e.result + '">' + e.result + '</span>' : e.fwd && e.fwd.length ? '<span class="res 追跡中">追跡中 ' + e.fwd.length + '日目</span>' : '') + '</div></div>' +
        '<div class="big"><div class="chg dn">' + pct(e.chg) + '</div><div class="px mono" style="font-size:12px;color:var(--muted)">' + fmt(e.close) + ' 円（前日 ' + fmt(e.prevClose) + '）</div></div></div>' +
      '<div class="mbody"><div>' +
        '<h3>直近90日（ローソク足・出来高・25日線）</h3><canvas class="chart" id="candle"></canvas>' +
        '<div class="grid2">' +
          stat('ギャップ（寄り）', pct(e.gap), chgCls(e.gap)) + stat('ザラ場（寄り→終）', pct(e.intraday), chgCls(e.intraday)) + stat('安値の前日比', pct(e.lowChg), chgCls(e.lowChg)) +
          stat('出来高倍率（20日比）', e.volRatio != null ? e.volRatio.toFixed(1) + 'x' : '−') + stat('売買代金（当日）', oku(e.turnover) + '円') + stat('直前5日の上昇', pct(e.runUp5), chgCls(e.runUp5)) +
          stat('RSI(14)', e.rsi14 != null ? e.rsi14.toFixed(0) : '−') + stat('25日線乖離', pct(e.ma25dev), chgCls(e.ma25dev)) + stat('60日高値から', pct(e.offHigh60), chgCls(e.offHigh60)) +
          stat('20日騰落', pct(e.chg20), chgCls(e.chg20)) + stat('52週 高値/安値', fmt(e.high52) + ' / ' + fmt(e.low52)) + stat('連続下落', e.downDays + '日') +
        '</div>' +
        '<div class="tags">' + (e.tags || []).map(function (t) { return '<span class="tag ' + tagCls(t) + '">' + esc(t) + '</span>'; }).join('') + '</div>' +
        (e.fwd && e.fwd.length ? '<h3 style="margin-top:14px">その後の推移（急落日の終値 ' + fmt(e.close0) + ' 円 比）</h3><table class="fwd"><thead><tr><th>日</th><th>日付</th><th class="num">終値</th><th class="num">騰落</th><th class="num">高値</th><th class="num">高値での反発</th><th class="num">安値</th></tr></thead><tbody>' +
          e.fwd.map(function (f) { return '<tr><td>+' + f.d + '</td><td class="mono">' + md(f.date) + '</td><td class="num">' + fmt(f.close) + '</td><td class="num chg ' + chgCls(f.chg) + '">' + pct(f.chg) + '</td><td class="num">' + fmt(f.high) + '</td><td class="num chg ' + chgCls(f.maxUp) + '">' + pct(f.maxUp) + '</td><td class="num">' + fmt(f.low) + '</td></tr>'; }).join('') + '</tbody></table>' +
          '<div class="grid2" style="grid-template-columns:repeat(4,1fr)">' + stat('翌日', pct(e.day1), chgCls(e.day1)) + stat('最大反発（5日内高値）', pct(e.maxRebound5), chgCls(e.maxRebound5)) + stat('最大下落（5日内安値）', pct(e.minDraw5), chgCls(e.minDraw5)) + stat('5日後', pct(e.day5), chgCls(e.day5)) + '</div>' : '') +
      '</div><div>' +
        '<h3>自分の判断</h3><div class="verdict" id="verdict">' + ['go', 'watch', 'skip'].map(function (v) { return '<button data-v="' + v + '" class="' + v + (note.v === v ? ' on' : '') + '">' + { go: '狙う', watch: '様子見', skip: '見送り' }[v] + '</button>'; }).join('') + '</div>' +
        '<textarea class="memo" id="memo" placeholder="メモ（なぜ狙う／見送るか、結果の振り返りなど）">' + esc(note.m || '') + '</textarea>' +
        '<div class="mlinks">' + links(e.code) + '<a href="https://news.google.com/search?q=' + encodeURIComponent('"' + e.name + '"') + '&hl=ja&gl=JP&ceid=JP:ja" target="_blank" rel="noopener">Googleニュース ↗</a></div>' +
        '<h3 style="margin-top:16px">ニュース（直近7日・取得時点）</h3>' +
        ((e.news || []).length ? '<ul class="newsfull">' + e.news.map(function (n) { return '<li><span class="d">' + md(n.date.slice(0, 10)) + '</span><a href="' + esc(n.link) + '" target="_blank" rel="noopener">' + esc(n.title) + '</a><span class="src">' + esc(n.source) + '</span>' + (n.cats || []).map(function (c) { return ' ' + catHtml(c); }).join('') + '</li>'; }).join('') + '</ul>' : '<p class="note">見つかりませんでした。</p>') +
      '</div></div>';
    $('modal').classList.add('on');
    loadChart(e.code).then(function (h) { var cv = $('candle'); if (cv && h) drawCandles(cv, h, e.date); });
    $('verdict').onclick = function (ev) { var b = ev.target.closest('button'); if (!b) return; var cur = S.notes[key] || {}; cur.v = cur.v === b.dataset.v ? '' : b.dataset.v; S.notes[key] = cur; saveNotes(); document.querySelectorAll('#verdict button').forEach(function (x) { x.classList.toggle('on', x.dataset.v === cur.v); }); refreshMarks(); };
    $('memo').oninput = function () { var cur = S.notes[key] || {}; cur.m = this.value; S.notes[key] = cur; saveNotes(); };
  }
  function stat(l, v, cls) { return '<div class="stat"><span>' + l + '</span><b class="' + (cls ? 'chg ' + cls : '') + '">' + v + '</b></div>'; }
  function refreshMarks() { document.querySelectorAll('.card').forEach(function (c) { var p = { date: c.dataset.date, code: c.dataset.code }; c.querySelector('.vdmark').innerHTML = verdictHtml(p); }); renderHistory(); }
  function closeModal() { $('modal').classList.remove('on'); }
  $('mClose').onclick = closeModal;
  $('modal').onclick = function (e) { if (e.target === this) closeModal(); };
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeModal(); });

  // ---------- 記録 ----------
  ['hResult', 'hCat', 'hVerdict', 'hQ'].forEach(function (id) { $(id).addEventListener('input', renderHistory); });
  function renderHistory() {
    var r = $('hResult').value, c = $('hCat').value, v = $('hVerdict').value, q = $('hQ').value.trim().toLowerCase();
    var list = S.history.filter(function (e) {
      if (r === 'tracking' ? e.done : r && e.result !== r) return false;
      if (c && e.cat !== c) return false;
      if (v && (S.notes[noteKey(e)] || {}).v !== v) return false;
      if (q && (e.name + e.code).toLowerCase().indexOf(q) < 0) return false;
      return true;
    });
    $('hRows').innerHTML = list.length ? list.map(function (e) {
      return '<tr class="row" data-code="' + esc(e.code) + '" data-date="' + esc(e.date) + '"><td class="mono">' + ymdJa(e.date) + '</td><td><div class="nm">' + esc(e.name) + '<small>' + esc(e.code) + ' · ' + esc(e.sector17 || '') + '</small></div></td><td>' + catHtml(e.cat) + '</td>' +
        '<td class="num chg dn">' + pct(e.chg) + '</td><td class="num">' + (e.volRatio != null ? e.volRatio.toFixed(1) + 'x' : '−') + '</td><td class="num chg ' + chgCls(e.runUp5) + '">' + pct(e.runUp5) + '</td><td>' + miniFwd(e) + '</td>' +
        '<td class="num chg ' + chgCls(e.day1) + '">' + pct(e.day1) + '</td><td class="num chg ' + chgCls(e.maxRebound5) + '">' + pct(e.maxRebound5) + '</td><td class="num chg ' + chgCls(e.day5) + '">' + pct(e.day5) + '</td>' +
        '<td>' + (e.result ? '<span class="res ' + e.result + '">' + e.result + '</span>' : '<span class="res 追跡中">追跡中' + (e.fwd && e.fwd.length ? ' ' + e.fwd.length + '日目' : '') + '</span>') + '</td><td>' + verdictHtml(e) + '</td></tr>';
    }).join('') : '<tr><td colspan="12" class="hint" style="text-align:center;padding:30px">記録はまだありません</td></tr>';
  }
  $('hRows').onclick = function (e) { var tr = e.target.closest('tr.row'); if (!tr) return; var h = S.history.filter(function (x) { return x.code === tr.dataset.code && x.date === tr.dataset.date; })[0]; if (h) openDetail(h); };
  $('exportNotes').onclick = function () {
    var rows = [['急落日', 'コード', '銘柄', '種別', '下落率', '判断', 'メモ', '翌日', '最大反発', '5日後', '結果']];
    S.history.forEach(function (e) { var n = S.notes[noteKey(e)]; if (!n || (!n.v && !n.m)) return; rows.push([e.date, e.code, e.name, e.cat, e.chg, { go: '狙う', watch: '様子見', skip: '見送り' }[n.v] || '', n.m || '', e.day1, e.maxRebound5, e.day5, e.result || '']); });
    if (rows.length === 1) { toast('書き出す判断メモがありません'); return; }
    var csv = '﻿' + rows.map(function (r) { return r.map(function (v) { return '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"'; }).join(','); }).join('\r\n');
    var a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' })); a.download = '急落株_判断メモ_' + new Date().toISOString().slice(0, 10) + '.csv'; a.click();
    toast((rows.length - 1) + ' 件を書き出しました');
  };

  // ---------- パターン ----------
  function renderPatterns() {
    var s = S.stats, t = s && s.total;
    $('pKpis').innerHTML = t && t.n ? [
      ['追跡した急落', t.n + '<small>件</small>', ''], ['翌日プラス率', t.up1Rate + '<small>%</small>', t.up1Rate >= 50 ? 'green' : 'red'],
      ['5日後プラス率', (t.up5Rate != null ? t.up5Rate + '<small>%（' + t.n5 + '件）</small>' : '−'), t.up5Rate >= 50 ? 'green' : 'red'],
      ['平均の最大反発', pct(t.avgMaxRebound), 'green'], ['平均の5日後', pct(t.avgDay5), t.avgDay5 >= 0 ? 'green' : 'red']
    ].map(function (k) { return '<div class="kpi"><div class="l">' + k[0] + '</div><div class="v ' + k[2] + '">' + k[1] + '</div></div>'; }).join('') : '<div class="kpi"><div class="l">パターン</div><div class="v">−</div><div class="note" style="margin-top:6px">急落の翌営業日からデータがたまります。毎日の更新で5営業日分の推移が追記され、ここに反発率が出ます。</div></div>';
    var groups = [['drop', '下落幅ごと'], ['cat', 'ニュースの種類ごと'], ['runUp', '飛びつき（直前5日の急騰）の有無'], ['vol', '出来高の急増'], ['gap', 'ギャップダウンの有無'], ['sector', '業種（17分類）']];
    $('pGrid').innerHTML = s ? groups.map(function (gr) {
      var rows = s[gr[0]] || [];
      return '<div class="pcard"><h3>' + gr[1] + '</h3><div class="phead"><span>区分</span><span>件数</span><span>翌日プラス率</span><span>5日後プラス率</span><span>最大反発</span></div>' +
        (rows.length ? rows.map(function (r) {
          return '<div class="prow"><span class="k" title="' + esc(r.key) + '">' + esc(r.key) + '</span><span class="n">' + r.n + '</span>' +
            '<div class="bar' + (r.up1Rate < 50 ? ' r' : '') + '"><i style="width:' + r.up1Rate + '%"></i><b>' + r.up1Rate + '%</b></div>' +
            '<div class="bar' + (r.up5Rate != null && r.up5Rate < 50 ? ' r' : '') + '"><i style="width:' + (r.up5Rate || 0) + '%"></i><b>' + (r.up5Rate != null ? r.up5Rate + '%' : '−') + '</b></div>' +
            '<span class="avg chg ' + chgCls(r.avgMaxRebound) + '">' + pct(r.avgMaxRebound) + '</span></div>';
        }).join('') : '<div class="hint" style="padding:10px 0">まだデータがありません</div>') + '</div>';
    }).join('') : '';
  }
})();
