// node test/run.js — 計算・判定・分類・追跡・統計の確認（ネットワーク不要）
'use strict';
const assert = require('assert');
const I = require('../scripts/lib/indicators');
const C = require('../scripts/lib/classify');
const N = require('../scripts/lib/news');
const T = require('../scripts/lib/track');
const P = require('../scripts/lib/pipeline');
const Y = require('../scripts/lib/yahoo');

let pass = 0;
function t(name, fn) { try { fn(); pass++; console.log('  ok  ' + name); } catch (e) { console.log('  NG  ' + name + '\n      ' + e.message); process.exitCode = 1; } }

// 日足のダミー: closes から o/h/l/v を作る
function mk(closes, opts) {
  opts = opts || {};
  const h = { code: opts.code || '1234', dates: [], o: [], h: [], l: [], c: [], v: [], meta: { name: 'テスト' } };
  let d = new Date(Date.UTC(2026, 8, 1));
  closes.forEach(function (c, i) {
    while (d.getUTCDay() === 0 || d.getUTCDay() === 6) d = new Date(d.getTime() + 86400000);
    h.dates.push(d.toISOString().slice(0, 10)); d = new Date(d.getTime() + 86400000);
    const o = opts.open && opts.open[i] != null ? opts.open[i] : (i ? closes[i - 1] : c);
    h.o.push(o); h.h.push(Math.max(o, c) * (opts.hi && opts.hi[i] || 1.005)); h.l.push(Math.min(o, c) * (opts.lo && opts.lo[i] || 0.995)); h.c.push(c); h.v.push(opts.vol && opts.vol[i] != null ? opts.vol[i] : 100000);
  });
  return h;
}

t('指標: 単純移動平均と RSI', function () {
  assert.strictEqual(I.sma([1, 2, 3, 4, 5], 3), 4);
  assert.strictEqual(I.sma([1, 2], 3), null);
  const up = []; for (let i = 0; i < 20; i++) up.push(100 + i);
  assert.strictEqual(I.rsi(up, 14), 100);
  const flat = Array(20).fill(100); assert.strictEqual(I.rsi(flat, 14), 50);
  const down = []; for (let i = 0; i < 20; i++) down.push(100 - i);
  assert.ok(I.rsi(down, 14) < 1);
});

t('指標: 急落日の前日比・ギャップ・出来高倍率・飛びつき・25日線・60日安値', function () {
  const closes = Array(30).fill(1000);
  for (let i = 24; i < 29; i++) closes[i] = 1000 + (i - 23) * 30; // 直前5日で +15%
  closes[29] = 1035; // 1150 → 1035 = −10%
  const vol = Array(30).fill(100000); vol[29] = 400000;
  const open = []; open[29] = 1100;
  const h = mk(closes, { vol: vol, open: open });
  const m = I.metricsAt(h);
  assert.strictEqual(Math.round(m.chg * 10) / 10, -10);
  assert.ok(Math.abs(m.gap - (1100 / 1150 - 1) * 100) < 0.01);
  assert.strictEqual(m.volRatio, 4);
  assert.strictEqual(Math.round(m.runUp5), 15);
  assert.ok(typeof m.ma25dev === 'number' && m.rsi14 != null);
  assert.strictEqual(m.newLow60, false);
  assert.strictEqual(m.downDays, 1);
  const tg = C.tags(m);
  assert.ok(tg.indexOf('飛びつき後の急落') >= 0 && tg.indexOf('出来高急増') >= 0 && tg.indexOf('ギャップダウン') >= 0, tg.join(','));
  assert.ok(C.score(m) > 20);
});

t('分類: ニュース見出し → 種別・主な種別の優先順位・下落幅の区分', function () {
  assert.deepStrictEqual(C.classify('○○、今期の業績予想を下方修正 減益に'), ['下方修正', '決算']);
  assert.deepStrictEqual(C.classify('△△が公募増資と売出しを発表'), ['増資・CB']);
  assert.deepStrictEqual(C.classify('□□、目標株価を引き下げ'), ['レーティング']);
  assert.deepStrictEqual(C.classify('天気の話'), []);
  assert.strictEqual(C.mainCategory([{ cats: ['決算'] }, { cats: ['下方修正', '決算'] }]), '下方修正');
  assert.strictEqual(C.mainCategory([{ cats: ['レーティング'] }, { cats: ['不祥事・不正'] }]), '不祥事・不正');
  assert.strictEqual(C.mainCategory([{ cats: [] }]), 'その他');
  assert.strictEqual(C.mainCategory([]), 'ニュースなし');
  assert.deepStrictEqual([-5.5, -8, -12, -20].map(C.dropBucket), ['−5〜−7%', '−7〜−10%', '−10〜−15%', '−15%以下']);
});

t('ニュース: RSS の解析（CDATA・媒体名の除去・新しい順・重複除去）', function () {
  const xml = '<rss><channel><item><title><![CDATA[A社、下方修正を発表 - 日経]]></title><link>https://x/1</link><pubDate>Mon, 26 Oct 2026 01:00:00 GMT</pubDate><source url="https://nikkei">日経</source></item>' +
    '<item><title>A社 株価が急落 - 株探</title><link>https://x/2</link><pubDate>Tue, 27 Oct 2026 01:00:00 GMT</pubDate><source url="https://k">株探</source></item>' +
    '<item><title>A社 株価が急落 - 株探</title><link>https://x/3</link><pubDate>Tue, 27 Oct 2026 02:00:00 GMT</pubDate><source url="https://k">株探</source></item></channel></rss>';
  const items = N.parseRss(xml, 8);
  assert.strictEqual(items.length, 2);
  assert.strictEqual(items[0].title, 'A社 株価が急落');
  assert.strictEqual(items[1].title, 'A社、下方修正を発表');
  assert.deepStrictEqual(items[1].cats, ['下方修正']);
  assert.ok(items[0].date > items[1].date);
  assert.ok(N.query('極洋', '1301').indexOf(encodeURIComponent('"極洋" 1301 when:7d')) > 0);
  assert.ok(N.query('花王', '4452').indexOf(encodeURIComponent('4452')) > 0, '2文字の名前はコードも付ける');
});

t('Yahoo: チャート応答の解析（終値が無い日は捨てる・JST の日付）', function () {
  const res = { timestamp: [1761609600, 1761696000, 1761782400], meta: { longName: 'X Corp', fiftyTwoWeekHigh: 10 },
    indicators: { quote: [{ open: [1, 2, 3], high: [1, 2, 3], low: [1, 2, 3], close: [1, null, 3], volume: [10, 20, 30] }] } };
  const h = Y.parseChart('1234', res);
  assert.deepStrictEqual(h.dates, ['2025-10-28', '2025-10-30']);
  assert.deepStrictEqual(h.c, [1, 3]);
  assert.strictEqual(h.meta.name, 'X Corp');
});

t('統合: 新しい日足を古いものに重ね、日付順・日数で丸める', function () {
  const a = mk([1, 2, 3, 4, 5]), b = mk([1, 2, 3, 4, 5, 6, 7]);
  b.c[4] = 50; // 同じ日は新しい方
  const m = P.mergeChart(a, b, 5);
  assert.deepStrictEqual(m.c, [3, 4, 50, 6, 7]);
  assert.strictEqual(m.dates.length, 5);
  assert.strictEqual(P.mergeChart(null, a, 3).c.length, 3);
  assert.strictEqual(P.mergeChart(a, null, 3), a);
});

t('相場日: 半分以上の銘柄が終わっている最新の日', function () {
  const cache = { a: mk([1, 2, 3]), b: mk([1, 2, 3]), c: mk([1, 2]), d: mk([1, 2, 3, 4]) };
  assert.strictEqual(P.marketDate(cache), mk([1, 2, 3]).dates[2]);
  assert.strictEqual(P.marketDate({}), null);
});

t('ピック: しきい値・流動性・並び（スコア順）・最大件数', function () {
  const uni = [{ code: 'A', name: 'A社', sector33: 'x', sector17: 'y', size: '' }, { code: 'B', name: 'B社' }, { code: 'C', name: 'C社' }, { code: 'D', name: 'D社' }];
  const cache = {
    A: mk(Array(29).fill(1000).concat([940]), { vol: Array(30).fill(100000) }),            // −6%・売買代金 1億 → ピック
    B: mk(Array(29).fill(1000).concat([880]), { vol: Array(30).fill(100000) }),            // −12% → 上位
    C: mk(Array(29).fill(1000).concat([940]), { vol: Array(30).fill(100) }),               // 流動性不足
    D: mk(Array(29).fill(1000).concat([970]), { vol: Array(30).fill(100000) })             // −3% → 対象外
  };
  const date = cache.A.dates[29];
  const picks = P.pick(uni, cache, date, { threshold: -5, minTurnover: 5e7 });
  assert.deepStrictEqual(picks.map(function (p) { return p.code; }), ['B', 'A']);
  assert.strictEqual(picks[0].chg, -12);
  assert.strictEqual(picks[0].sector17, undefined); assert.strictEqual(picks[1].sector17, 'y');
  assert.strictEqual(P.pick(uni, cache, date, { threshold: -5, minTurnover: 5e7, maxPicks: 1 }).length, 1);
  assert.strictEqual(P.pick(uni, cache, date, { threshold: -3, minTurnover: 0 }).length, 4);
});

t('追跡: 翌営業日から5日の推移・最大反発・結果ラベル', function () {
  const h = mk([1000, 900, 920, 950, 980, 1000, 1010, 1020]); // 900 が急落日
  const e = { date: h.dates[1], code: '1234', close0: 900 };
  const f = T.forward(e, h);
  assert.strictEqual(f.fwd.length, 5);
  assert.strictEqual(f.done, true);
  assert.strictEqual(f.day1, 2.2);
  assert.strictEqual(f.day5, 12.2);
  assert.ok(f.maxRebound5 >= 12.2);
  assert.strictEqual(f.result, '反発');
  assert.strictEqual(f.bestDay, 5);
  const part = T.forward(e, mk([1000, 900, 880]));
  assert.strictEqual(part.fwd.length, 1); assert.strictEqual(part.done, false); assert.strictEqual(part.result, undefined);
  assert.strictEqual(T.forward({ date: '2000-01-01', code: 'x', close0: 1 }, h), null);
  assert.strictEqual(T.summarize({ close0: 100 }, [{ d: 1, chg: -5, maxUp: -1, low: 90 }, { d: 2, chg: -4, maxUp: 0, low: 92 }, { d: 3, chg: -3, maxUp: 0, low: 93 }, { d: 4, chg: -4, maxUp: 0, low: 93 }, { d: 5, chg: -4, maxUp: 0, low: 93 }]).result, '続落');
});

t('記録の更新: 同じ日・同じ銘柄は足さない／追跡中だけ更新／新しい順', function () {
  const h = mk([1000, 900, 920, 950, 980, 1000, 1010]);
  const cache = { '1234': h };
  const pickA = { code: '1234', name: 'A', date: h.dates[1], close: 900, chg: -10, score: 20, news: [{ title: 'x 下方修正', cats: ['下方修正'] }] };
  let hist = P.updateHistory([], [pickA], cache);
  assert.strictEqual(hist.length, 1);
  assert.strictEqual(hist[0].cat, '下方修正');
  assert.strictEqual(hist[0].fwd.length, 5);
  hist = P.updateHistory(hist, [pickA], cache);
  assert.strictEqual(hist.length, 1, '重複しない');
  const pickB = { code: '1234', name: 'A', date: h.dates[5], close: 1000, chg: -6, score: 10, news: [] };
  hist = P.updateHistory(hist, [pickB], cache);
  assert.strictEqual(hist.length, 2);
  assert.strictEqual(hist[0].date, h.dates[5], '新しい順');
  assert.strictEqual(hist[0].cat, 'ニュースなし');
  assert.strictEqual(hist[0].fwd.length, 1);
});

t('統計: 区分ごとの翌日プラス率・5日後プラス率・平均最大反発', function () {
  const es = [
    { chg: -6, cat: '決算', runUp5: 10, volRatio: 4, gap: -4, sector17: '食品', fwd: [1], day1: 2, day5: 5, maxRebound5: 8, done: true, result: '反発' },
    { chg: -6, cat: '決算', runUp5: 0, volRatio: 1, gap: 0, sector17: '食品', fwd: [1], day1: -1, day5: -4, maxRebound5: 1, done: true, result: '続落' },
    { chg: -12, cat: '不祥事・不正', runUp5: 0, volRatio: 5, gap: -8, sector17: '機械', fwd: [1], day1: 3, maxRebound5: 6, done: false },
    { chg: -8, cat: 'その他', fwd: [], done: false }
  ];
  const s = T.stats(es);
  assert.strictEqual(s.total.n, 3); assert.strictEqual(s.total.up1Rate, 67); assert.strictEqual(s.total.n5, 2); assert.strictEqual(s.total.up5Rate, 50);
  assert.strictEqual(s.total.avgMaxRebound, 5);
  const d57 = s.drop.filter(function (x) { return x.key === '−5〜−7%'; })[0];
  assert.deepStrictEqual([d57.n, d57.up1Rate, d57.up5Rate, d57.avgDay5, d57.results['反発']], [2, 50, 50, 0.5, 1]);
  assert.strictEqual(s.runUp.filter(function (x) { return /飛びつき後/.test(x.key); })[0].n, 1);
  assert.strictEqual(s.cat[0].key, '決算');
});

console.log(pass + ' 件 OK' + (process.exitCode ? '（失敗あり）' : ''));
