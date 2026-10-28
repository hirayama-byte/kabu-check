// 日次処理: 株価の更新 → 急落のピック → ニュース → 記録の追跡 → 統計 → docs/data/*.json
// 使い方: node scripts/fetch.js [--threshold=-5] [--limit=200] [--offline] [--no-news]
'use strict';
const fs = require('fs'), path = require('path');
const { fetchAll } = require('./lib/yahoo');
const { fetchNews } = require('./lib/news');
const { mainCategory } = require('./lib/classify');
const { stats } = require('./lib/track');
const P = require('./lib/pipeline');

const root = path.join(__dirname, '..');
const F = {
  universe: path.join(root, 'docs/data/universe.json'), cache: path.join(root, 'data/cache/prices.json'),
  today: path.join(root, 'docs/data/today.json'), history: path.join(root, 'docs/data/history.json'),
  stats: path.join(root, 'docs/data/stats.json'), meta: path.join(root, 'docs/data/meta.json'), stocks: path.join(root, 'docs/data/stocks')
};
const argv = {};
process.argv.slice(2).forEach(function (a) { const m = /^--([^=]+)(?:=(.*))?$/.exec(a); if (m) argv[m[1]] = m[2] === undefined ? true : m[2]; });
const cfg = Object.assign({}, P.DEFAULT_CFG, argv.threshold ? { threshold: +argv.threshold } : {});

function readJson(p, def) { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch (e) { return def; } }
function writeJson(p, v) { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, JSON.stringify(v)); }
function nowJst() { return new Date(Date.now() + 9 * 3600000).toISOString().replace('T', ' ').slice(0, 16) + ' JST'; }
function daysBetween(a, b) { return Math.round((new Date(b) - new Date(a)) / 86400000); }
function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

async function main() {
  const t0 = Date.now();
  const uni = readJson(F.universe, null);
  if (!uni) throw new Error('docs/data/universe.json がありません。先に node scripts/universe.js を実行してください');
  let list = uni.list;
  if (argv.limit) list = list.slice(0, +argv.limit);
  const cache = readJson(F.cache, {});
  const today = new Date(Date.now() + 9 * 3600000).toISOString().slice(0, 10);

  // 1. 株価の更新（キャッシュが新しければ 5 日分だけ、無ければ 3 か月）
  if (!argv.offline) {
    const codes = list.map(function (u) { return u.code; });
    const rangeOf = function (code) { const h = cache[code]; return h && h.dates.length && daysBetween(h.dates[h.dates.length - 1], today) <= 10 ? '5d' : '3mo'; };
    let ng = 0;
    const got = await fetchAll(codes, rangeOf, { concurrency: 5, delay: 80, onEach: function (code, ch, done, total) { if (!ch) ng++; if (done % 200 === 0 || done === total) console.log('  株価 ' + done + '/' + total + (ng ? '（取れず ' + ng + '）' : '')); } });
    codes.forEach(function (code) { if (got[code]) cache[code] = P.mergeChart(cache[code], got[code], cfg.keepDays); });
    writeJson(F.cache, cache);
  }
  const date = P.marketDate(cache);
  if (!date) throw new Error('株価データがありません');
  console.log('相場日 ' + date + '（しきい値 ' + cfg.threshold + '%・売買代金 ' + (cfg.minTurnover / 1e8) + '億円以上）');

  // 2. 急落のピック
  const picks = P.pick(list, cache, date, cfg);
  console.log('急落 ' + picks.length + ' 銘柄');

  // 3. ニュース（ピックした銘柄だけ・同時3）
  if (!argv['no-news']) {
    const q = picks.slice();
    async function w() { while (q.length) { const p = q.shift(); p.news = await fetchNews(p.name, p.code, 8); p.cat = mainCategory(p.news); await sleep(250); } }
    await Promise.all([w(), w(), w()]);
  } else picks.forEach(function (p) { p.news = []; p.cat = 'ニュースなし'; });

  // 4. 記録の更新（新しいピック＋追跡中の5日推移）と統計
  const history = P.updateHistory(readJson(F.history, []), picks, cache);
  writeJson(F.history, history);
  writeJson(F.stats, stats(history));

  // 5. 画面用の日足（今日のピック＋追跡中の記録）
  const need = {};
  picks.forEach(function (p) { need[p.code] = true; });
  history.forEach(function (e) { if (!e.done || daysBetween(e.date, today) <= 30) need[e.code] = true; });
  fs.mkdirSync(F.stocks, { recursive: true });
  Object.keys(need).forEach(function (code) { if (cache[code]) writeJson(path.join(F.stocks, code + '.json'), P.chartFor(cache[code], cfg.chartDays)); });

  // 6. 今日のファイルとメタ
  writeJson(F.today, { date: date, generatedAt: nowJst(), threshold: cfg.threshold, minTurnover: cfg.minTurnover, picks: picks });
  const tracking = history.filter(function (e) { return !e.done; }).length;
  writeJson(F.meta, { date: date, generatedAt: nowJst(), universe: uni.count, universeAsof: uni.asof, picksToday: picks.length, historyCount: history.length, tracking: tracking, threshold: cfg.threshold });
  console.log('完了 ' + Math.round((Date.now() - t0) / 1000) + '秒。記録 ' + history.length + ' 件（追跡中 ' + tracking + '）');
}
main().catch(function (e) { console.error(e); process.exit(1); });
