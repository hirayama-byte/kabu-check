// 日次処理の中身（ネットワークを使わない部分。テスト対象）
'use strict';
const { metricsAt } = require('./indicators');
const { tags, score, mainCategory } = require('./classify');
const { forward } = require('./track');

const DEFAULT_CFG = {
  threshold: -5,        // 前日比がこれ以下で急落（%）
  minTurnover: 5e7,     // 20日平均の売買代金がこれ未満（円）は除く（流動性）
  maxPicks: 40,         // 1日の最大ピック数
  keepDays: 110,        // キャッシュに残す日数
  chartDays: 90         // 画面用に出す日数
};

// 日足の統合（新しい方を優先・日付順・keepDays 日に丸める）
function mergeChart(oldH, newH, keepDays) {
  if (!newH) return oldH || null;
  if (!oldH) return trim(newH, keepDays);
  const by = {};
  const put = function (h) { h.dates.forEach(function (d, i) { by[d] = [h.o[i], h.h[i], h.l[i], h.c[i], h.v[i]]; }); };
  put(oldH); put(newH);
  const dates = Object.keys(by).sort();
  const out = { code: newH.code, dates: [], o: [], h: [], l: [], c: [], v: [], meta: newH.meta || oldH.meta };
  dates.forEach(function (d) { const r = by[d]; out.dates.push(d); out.o.push(r[0]); out.h.push(r[1]); out.l.push(r[2]); out.c.push(r[3]); out.v.push(r[4]); });
  return trim(out, keepDays);
}
function trim(h, keepDays) {
  const n = h.dates.length, k = Math.max(0, n - (keepDays || DEFAULT_CFG.keepDays));
  if (!k) return h;
  const out = { code: h.code, meta: h.meta };
  ['dates', 'o', 'h', 'l', 'c', 'v'].forEach(function (f) { out[f] = h[f].slice(k); });
  return out;
}

// その日の相場日＝最後の日付として最も多い日（半分以上の銘柄がその日付で終わっていること）
function marketDate(cache) {
  const count = {}; let total = 0;
  Object.keys(cache).forEach(function (code) { const h = cache[code]; if (!h || !h.dates.length) return; total++; const d = h.dates[h.dates.length - 1]; count[d] = (count[d] || 0) + 1; });
  const dates = Object.keys(count).sort().reverse();
  for (const d of dates) if (count[d] >= total * 0.5) return d;
  return dates[0] || null;
}

function r2(v) { return v == null || isNaN(v) ? null : Math.round(v * 100) / 100; }
function roundMetrics(m) { const o = {}; Object.keys(m).forEach(function (k) { o[k] = typeof m[k] === 'number' ? r2(m[k]) : m[k]; }); return o; }

// 急落銘柄のピック（ニュースはまだ付けない）
function pick(universe, cache, date, cfg) {
  cfg = Object.assign({}, DEFAULT_CFG, cfg || {});
  const out = [];
  universe.forEach(function (u) {
    const h = cache[u.code];
    if (!h || !h.dates.length || h.dates[h.dates.length - 1] !== date) return;
    const m = metricsAt(h);
    if (!m || m.chg == null || m.chg > cfg.threshold) return;
    const liq = m.avgTurnover20 != null ? m.avgTurnover20 : m.turnover;
    if (liq < cfg.minTurnover) return;
    const e = Object.assign({ code: u.code, name: u.name, sector33: u.sector33, sector17: u.sector17, size: u.size, date: date }, roundMetrics(m));
    e.tags = tags(m); e.score = score(m);
    e.high52 = h.meta && h.meta.high52 || null; e.low52 = h.meta && h.meta.low52 || null;
    out.push(e);
  });
  out.sort(function (a, b) { return b.score - a.score || a.chg - b.chg; });
  return out.slice(0, cfg.maxPicks);
}

// 画面用の日足（直近 chartDays 日）
function chartFor(h, days) {
  const t = trim(h, days || DEFAULT_CFG.chartDays);
  return { code: t.code, dates: t.dates, o: t.o, h: t.h, l: t.l, c: t.c, v: t.v };
}

// 記録の更新: 新しいピックを足し（同じ日・同じ銘柄は足さない）、追跡中の記録に5営業日の推移を付ける
function updateHistory(history, picks, cache) {
  const key = function (e) { return e.date + ':' + e.code; };
  const have = {};
  history.forEach(function (e) { have[key(e)] = true; });
  picks.forEach(function (p) {
    if (have[key(p)]) return;
    const e = Object.assign({}, p);
    e.close0 = p.close;
    e.news = (p.news || []).slice(0, 6);
    e.cat = p.cat || mainCategory(e.news);
    e.fwd = [];
    history.push(e);
  });
  history.forEach(function (e) {
    if (e.done) return;
    const h = cache[e.code];
    if (!h) return;
    const f = forward({ date: e.date, code: e.code, close0: e.close0 }, h);
    if (f) Object.assign(e, f);
  });
  history.sort(function (a, b) { return b.date.localeCompare(a.date) || b.score - a.score; });
  return history;
}

module.exports = { DEFAULT_CFG, mergeChart, trim, marketDate, pick, chartFor, updateHistory, roundMetrics };
