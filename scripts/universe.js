// JPX 公式「東証上場銘柄一覧」からプライム（内国株式）の一覧を作る → docs/data/universe.json
// 使い方: node scripts/universe.js [--offline]（--offline は data/cache/data_j.xlsx をそのまま使う）
'use strict';
const fs = require('fs'), path = require('path');
const XLSX = require('xlsx');

const URL = 'https://www.jpx.co.jp/markets/statistics-equities/misc/tvdivq0000001vg2-att/data_j.xlsx';
const root = path.join(__dirname, '..');
const xlsxPath = path.join(root, 'data/cache/data_j.xlsx');
const outPath = path.join(root, 'docs/data/universe.json');

async function main() {
  if (process.argv.indexOf('--offline') < 0) {
    const r = await fetch(URL, { headers: { 'User-Agent': 'kabu-check/0.1' } });
    if (!r.ok) throw new Error('JPX の一覧を取得できませんでした: ' + r.status);
    fs.mkdirSync(path.dirname(xlsxPath), { recursive: true });
    fs.writeFileSync(xlsxPath, Buffer.from(await r.arrayBuffer()));
  }
  const wb = XLSX.readFile(xlsxPath);
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]]);
  const list = rows.filter(function (r) { return String(r['市場・商品区分']) === 'プライム（内国株式）'; })
    .map(function (r) { return { code: String(r['コード']), name: String(r['銘柄名']), sector33: String(r['33業種区分'] || ''), sector17: String(r['17業種区分'] || ''), size: String(r['規模区分'] || '') }; })
    .sort(function (a, b) { return a.code.localeCompare(b.code); });
  const asof = String(rows[0]['日付'] || '');
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify({ asof: asof.replace(/^(\d{4})(\d{2})(\d{2})$/, '$1-$2-$3'), count: list.length, list: list }));
  console.log('プライム ' + list.length + ' 銘柄（JPX ' + asof + '）→ ' + path.relative(root, outPath));
}
main().catch(function (e) { console.error(e); process.exit(1); });
