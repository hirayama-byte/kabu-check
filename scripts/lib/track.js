// ピック後5営業日の追跡と、パターン統計（純粋関数・テスト対象）
'use strict';
const { pct } = require('./indicators');
const { dropBucket } = require('./classify');

// entry: { date, code, close0 } と日足 h から、急落日の翌営業日〜5営業日の推移を作る
// → { fwd: [{d, date, close, high, low, chg, maxUp}], day1, day5, maxRebound5, minDraw5, done, result }
function forward(entry, h) {
  const i0 = h.dates.indexOf(entry.date);
  if (i0 < 0) return null;
  const fwd = [];
  for (let k = 1; k <= 5 && i0 + k < h.dates.length; k++) {
    const i = i0 + k;
    fwd.push({ d: k, date: h.dates[i], close: h.c[i], high: h.h[i], low: h.l[i], chg: r1(pct(h.c[i], entry.close0)), maxUp: r1(pct(h.h[i], entry.close0)) });
  }
  return summarize(entry, fwd);
}
function summarize(entry, fwd) {
  const out = { fwd: fwd, done: fwd.length >= 5 };
  if (!fwd.length) return out;
  out.day1 = fwd[0].chg;
  out.day5 = fwd[fwd.length - 1].chg;
  out.maxRebound5 = r1(Math.max.apply(null, fwd.map(function (f) { return f.maxUp; })));
  out.minDraw5 = r1(Math.min.apply(null, fwd.map(function (f) { return pct(f.low, entry.close0); })));
  out.bestDay = fwd.reduce(function (m, f) { return f.maxUp > m.maxUp ? f : m; }, fwd[0]).d;
  if (out.done) out.result = out.day5 >= 3 ? '反発' : out.day5 <= -3 ? '続落' : '横ばい';
  return out;
}
function r1(v) { return v == null ? null : Math.round(v * 10) / 10; }

// 統計: 1日以上追跡できた記録を、区分ごとに集計
function stats(entries) {
  const groups = { drop: {}, cat: {}, runUp: {}, vol: {}, gap: {}, sector: {} };
  function add(g, key, e) {
    const o = groups[g][key] = groups[g][key] || { key: key, n: 0, up1: 0, n5: 0, up5: 0, sumMax: 0, sumDay5: 0, results: { 反発: 0, 続落: 0, 横ばい: 0 } };
    o.n++;
    if (e.day1 > 0) o.up1++;
    if (e.maxRebound5 != null) o.sumMax += e.maxRebound5;
    if (e.done) { o.n5++; if (e.day5 > 0) o.up5++; o.sumDay5 += e.day5; o.results[e.result]++; }
  }
  entries.filter(function (e) { return e.fwd && e.fwd.length; }).forEach(function (e) {
    add('drop', dropBucket(e.chg), e);
    add('cat', e.cat || 'その他', e);
    add('runUp', e.runUp5 != null && e.runUp5 >= 8 ? '飛びつき後（直前5日 +8%以上）' : '飛びつきなし', e);
    add('vol', e.volRatio != null && e.volRatio >= 3 ? '出来高3倍以上' : '出来高3倍未満', e);
    add('gap', e.gap != null && e.gap <= -3 ? 'ギャップダウン（−3%以上）' : 'ギャップなし', e);
    add('sector', e.sector17 || 'その他', e);
  });
  const out = {};
  Object.keys(groups).forEach(function (g) {
    out[g] = Object.keys(groups[g]).map(function (k) {
      const o = groups[g][k];
      return { key: k, n: o.n, up1Rate: Math.round(o.up1 / o.n * 100), n5: o.n5, up5Rate: o.n5 ? Math.round(o.up5 / o.n5 * 100) : null,
               avgMaxRebound: r1(o.sumMax / o.n), avgDay5: o.n5 ? r1(o.sumDay5 / o.n5) : null, results: o.results };
    }).sort(function (a, b) { return b.n - a.n; });
  });
  const all = entries.filter(function (e) { return e.fwd && e.fwd.length; });
  const done = all.filter(function (e) { return e.done; });
  out.total = { n: all.length, up1Rate: all.length ? Math.round(all.filter(function (e) { return e.day1 > 0; }).length / all.length * 100) : null,
                n5: done.length, up5Rate: done.length ? Math.round(done.filter(function (e) { return e.day5 > 0; }).length / done.length * 100) : null,
                avgMaxRebound: all.length ? r1(all.reduce(function (s, e) { return s + e.maxRebound5; }, 0) / all.length) : null,
                avgDay5: done.length ? r1(done.reduce(function (s, e) { return s + e.day5; }, 0) / done.length) : null };
  return out;
}

module.exports = { forward, summarize, stats };
