// ニュース見出しの分類（キーワード）と、急落のタグ付け・スコア
'use strict';

const CATS = [
  ['下方修正', ['下方修正', '減益', '赤字', '業績予想を下方', '損失', '減配', '無配', '特別損失', '債務超過', '営業損失', '純損失']],
  ['上方修正', ['上方修正', '増益', '増配', '最高益', '過去最高']],
  ['決算', ['決算', '四半期', '通期', '業績', '営業利益', '経常利益', '売上高', '純利益']],
  ['増資・CB', ['増資', '新株予約権', 'CB', '転換社債', '公募', '売出し', '株式売出', '第三者割当', '希薄化']],
  ['不祥事・不正', ['不正', '不祥事', '不適切', '捜査', '逮捕', '行政処分', '業務停止', '課徴金', '虚偽', '隠蔽', 'リコール', '事故', '訴訟', '提訴', '調査委員会', '漏洩', '漏えい']],
  ['レーティング', ['レーティング', '目標株価', '投資判断', '格下げ', '格上げ', '引き下げ', '引き上げ', 'アナリスト']],
  ['自社株買い', ['自社株買い', '自己株式', '自社株']],
  ['提携・M&A', ['買収', 'TOB', '提携', '合併', '子会社化', 'MBO', '統合', '出資']],
  ['需給・市場', ['信用', '空売り', '大量保有', '売却', 'ストップ安', 'ストップ高', '急落', '急騰', '大幅安', '大幅高', '年初来安値', '年初来高値']],
  ['新製品・受注', ['受注', '新製品', '発売', '承認', '開発', '契約', '採用']]
];
function classify(title) {
  const t = String(title || '');
  const hits = [];
  CATS.forEach(function (c) { if (c[1].some(function (k) { return t.indexOf(k) >= 0; })) hits.push(c[0]); });
  if (/上方修正(なく|なし|せず|見送|は無|がな)/.test(t)) { const i = hits.indexOf('上方修正'); if (i >= 0) hits.splice(i, 1); if (hits.indexOf('決算') < 0) hits.push('決算'); }
  return hits;
}
// ニュース一覧から銘柄の主な種別を1つ決める（優先順位: 下方修正 > 不祥事 > 増資 > レーティング > 決算 > …）
const PRIORITY = ['下方修正', '不祥事・不正', '増資・CB', 'レーティング', '決算', '提携・M&A', '上方修正', '自社株買い', '需給・市場', '新製品・受注'];
function mainCategory(newsList) {
  const all = {};
  (newsList || []).forEach(function (n) { (n.cats || []).forEach(function (c) { all[c] = (all[c] || 0) + 1; }); });
  for (const p of PRIORITY) if (all[p]) return p;
  return (newsList || []).length ? 'その他' : 'ニュースなし';
}

// 急落のタグとスコア。m = metricsAt の結果
function tags(m) {
  const t = [];
  if (m.runUp5 != null && m.runUp5 >= 8) t.push('飛びつき後の急落');
  if (m.volRatio != null && m.volRatio >= 3) t.push('出来高急増');
  if (m.gap != null && m.gap <= -3) t.push('ギャップダウン');
  if (m.intraday != null && m.intraday <= -3) t.push('ザラ場で続落');
  if (m.intraday != null && m.intraday >= 2 && m.lowChg != null && m.lowChg <= -5) t.push('下ヒゲ（戻した）');
  if (m.rsi14 != null && m.rsi14 <= 30) t.push('売られすぎ（RSI≤30）');
  if (m.ma25dev != null && m.ma25dev <= -10) t.push('25日線から−10%超');
  if (m.newLow60) t.push('60日安値更新');
  if (m.downDays >= 3) t.push(m.downDays + '日続落');
  return t;
}
// 大きい順に並べるためのスコア（下落幅＋出来高＋飛びつき＋ギャップ）
function score(m) {
  let s = Math.abs(Math.min(0, m.chg || 0)) * 2;
  if (m.volRatio) s += Math.min(m.volRatio, 10) * 1.5;
  if (m.runUp5 != null && m.runUp5 > 0) s += Math.min(m.runUp5, 30) * 0.5;
  if (m.gap != null && m.gap < 0) s += Math.abs(m.gap) * 0.5;
  return Math.round(s * 10) / 10;
}
// 下落幅の区分（統計用）
function dropBucket(chg) { return chg <= -15 ? '−15%以下' : chg <= -10 ? '−10〜−15%' : chg <= -7 ? '−7〜−10%' : '−5〜−7%'; }

module.exports = { classify, mainCategory, tags, score, dropBucket, CATS };
