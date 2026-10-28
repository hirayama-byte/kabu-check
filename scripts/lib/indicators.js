// 指標の計算（純粋関数・テスト対象）
'use strict';

function sma(arr, n, end) { // end を含む直近 n 本の単純平均（足りなければ null）
  end = end == null ? arr.length - 1 : end;
  if (end - n + 1 < 0) return null;
  let s = 0;
  for (let i = end - n + 1; i <= end; i++) s += arr[i];
  return s / n;
}

// RSI(14)。終値の配列から、最後の値の RSI を返す（足りなければ null）
function rsi(c, n, end) {
  n = n || 14; end = end == null ? c.length - 1 : end;
  if (end < n) return null;
  let gain = 0, loss = 0;
  for (let i = end - n + 1; i <= end; i++) { const d = c[i] - c[i - 1]; if (d > 0) gain += d; else loss -= d; }
  if (gain + loss === 0) return 50;
  if (loss === 0) return 100;
  const rs = (gain / n) / (loss / n);
  return 100 - 100 / (1 + rs);
}

function pct(a, b) { return b ? (a / b - 1) * 100 : null; } // a は b の何%増減か

// 日足 { dates, o, h, l, c, v } の i 番目（既定は最後）の指標をまとめて返す
function metricsAt(h, i) {
  i = i == null ? h.c.length - 1 : i;
  if (i < 1) return null;
  const c0 = h.c[i], prev = h.c[i - 1];
  const vAvg20 = i >= 20 ? sma(h.v, 20, i - 1) : (i >= 5 ? sma(h.v, i, i - 1) : null);
  const ma25 = sma(h.c, 25, i), ma5 = sma(h.c, 5, i);
  const low60 = i >= 1 ? Math.min.apply(null, h.l.slice(Math.max(0, i - 60), i)) : null; // 当日を除く直近60日の安値
  const high60 = i >= 1 ? Math.max.apply(null, h.h.slice(Math.max(0, i - 60), i)) : null;
  return {
    close: c0, prevClose: prev, open: h.o[i], high: h.h[i], low: h.l[i], volume: h.v[i],
    chg: pct(c0, prev),                                   // 前日比
    gap: pct(h.o[i], prev),                                // 寄り付きの前日比（ギャップ）
    intraday: pct(c0, h.o[i]),                            // 寄りからの動き
    lowChg: pct(h.l[i], prev),                            // 安値の前日比（ザラ場の最大下落）
    volRatio: vAvg20 ? h.v[i] / vAvg20 : null,            // 出来高倍率（20日平均比）
    turnover: Math.round(c0 * h.v[i]),                    // 売買代金（円・概算）
    avgTurnover20: vAvg20 ? Math.round(vAvg20 * c0) : null,
    runUp5: i >= 6 ? pct(prev, h.c[i - 6]) : null,        // 急落日の前日までの5日間の上昇率（飛びつき）
    chg5: i >= 5 ? pct(c0, h.c[i - 5]) : null,            // 5日騰落
    chg20: i >= 20 ? pct(c0, h.c[i - 20]) : null,
    ma25dev: ma25 ? pct(c0, ma25) : null,                 // 25日線乖離
    ma5dev: ma5 ? pct(c0, ma5) : null,
    rsi14: rsi(h.c, 14, i),
    newLow60: low60 != null && h.l[i] < low60,            // 60日安値更新
    high60: high60, low60: low60,
    offHigh60: high60 ? pct(c0, high60) : null,           // 60日高値からの下落率
    downDays: countDownDays(h.c, i)                       // 連続下落日数
  };
}
function countDownDays(c, i) { let n = 0; for (let k = i; k >= 1 && c[k] < c[k - 1]; k--) n++; return n; }

module.exports = { sma, rsi, pct, metricsAt };
