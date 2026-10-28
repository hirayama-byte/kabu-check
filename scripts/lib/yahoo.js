// Yahoo Finance のチャート API（日足）。1銘柄1リクエスト。クラム（認証）不要の v8 エンドポイントだけを使う
'use strict';

const UA = 'kabu-check/0.1 (+personal dashboard; node ' + process.version + ')';

function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

// 1銘柄の日足 { code, dates: ['yyyy-mm-dd'], o, h, l, c, v, meta } を返す。取れなければ null
async function fetchChart(code, range, retry) {
  retry = retry == null ? 3 : retry;
  const url = 'https://query2.finance.yahoo.com/v8/finance/chart/' + code + '.T?range=' + (range || '5d') + '&interval=1d';
  for (let t = 0; t <= retry; t++) {
    try {
      const r = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json' } });
      if (r.status === 429 || r.status >= 500) { await sleep(3000 * (t + 1)); continue; }
      if (!r.ok) return null; // 404 = 上場廃止など
      const j = await r.json();
      const res = j && j.chart && j.chart.result && j.chart.result[0];
      if (!res || !res.timestamp) return null;
      return parseChart(code, res);
    } catch (e) {
      if (t === retry) return null;
      await sleep(2000 * (t + 1));
    }
  }
  return null;
}

// JST の日付にして、終値が無い日（休場・欠損）は捨てる
function parseChart(code, res) {
  const q = res.indicators.quote[0];
  const out = { code: String(code), dates: [], o: [], h: [], l: [], c: [], v: [], meta: pickMeta(res.meta) };
  res.timestamp.forEach(function (ts, i) {
    if (q.close[i] == null) return;
    const d = new Date((ts + 9 * 3600) * 1000).toISOString().slice(0, 10);
    if (out.dates.length && out.dates[out.dates.length - 1] === d) return; // 同じ日が重複したら最初だけ
    out.dates.push(d);
    out.o.push(round(q.open[i])); out.h.push(round(q.high[i])); out.l.push(round(q.low[i])); out.c.push(round(q.close[i])); out.v.push(q.volume[i] || 0);
  });
  return out;
}
function round(v) { return v == null ? null : Math.round(v * 100) / 100; }
function pickMeta(m) {
  m = m || {};
  return { name: m.longName || m.shortName || '', high52: m.fiftyTwoWeekHigh || null, low52: m.fiftyTwoWeekLow || null, price: m.regularMarketPrice || null, prevClose: m.chartPreviousClose || null };
}

// まとめて取る。同時 concurrency・1件ごとに delay ms。onEach(code, chart|null) で進捗
async function fetchAll(codes, range, opts) {
  opts = opts || {};
  const concurrency = opts.concurrency || 5, delay = opts.delay == null ? 80 : opts.delay;
  const queue = codes.slice(), out = {};
  let done = 0;
  async function worker() {
    while (queue.length) {
      const code = queue.shift();
      const ch = await fetchChart(code, typeof range === 'function' ? range(code) : range);
      out[code] = ch;
      done++;
      if (opts.onEach) opts.onEach(code, ch, done, codes.length);
      await sleep(delay);
    }
  }
  const ws = [];
  for (let i = 0; i < concurrency; i++) ws.push(worker());
  await Promise.all(ws);
  return out;
}

module.exports = { fetchChart, fetchAll, parseChart };
