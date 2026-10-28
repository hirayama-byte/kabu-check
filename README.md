# 急落株チェック（kabu-check）

プライム市場でその日に急落（前日比 −5% 以下・既定）した銘柄を毎日ピックアップし、値動き・ニュース・指標を1画面で見て「買い戻し（リバウンド）を狙うか／見送るか」を自分で判断するための個人用ダッシュボード。ピックした銘柄はその後5営業日の推移を自動で追記し、パターン（下落幅・ニュースの種類・飛びつきの有無など）ごとの反発率を集計します。

- 公開: GitHub Pages（`docs/`）。`noindex`
- 更新: GitHub Actions `daily`（平日 16:10 JST）。手動実行も可（Actions → daily → Run workflow）
- 投資助言ではありません。公開データの整理です

## 仕組み
| 役割 | ファイル | データ源 |
|---|---|---|
| 銘柄一覧（プライム・内国株式） | `scripts/universe.js` → `docs/data/universe.json` | JPX「東証上場銘柄一覧」data_j.xlsx（月初に更新） |
| 株価（日足） | `scripts/lib/yahoo.js` → `data/cache/prices.json`（直近110日） | Yahoo Finance チャート API（v8） |
| 急落のピック・指標・タグ | `scripts/lib/pipeline.js`・`indicators.js`・`classify.js` → `docs/data/today.json` | − |
| ニュース | `scripts/lib/news.js` | Google ニュース RSS（銘柄名・直近7日） |
| 記録と5日間の追跡・統計 | `scripts/lib/track.js` → `docs/data/history.json`・`stats.json` | − |
| 画面 | `docs/index.html`・`app.js`・`style.css` | 判断メモはブラウザ（localStorage）に保存・CSV 書き出し |

みんかぶ・株探は自動取得しません（bot 対策で拒否されるため）。各銘柄のリンクから開いて確認します。

## ローカルで動かす
```
npm install
node scripts/universe.js          # 銘柄一覧（初回・月1）
node scripts/fetch.js             # 日次処理（全銘柄の株価 1〜2分）
node scripts/fetch.js --offline   # 株価を取り直さずに再集計
node test/run.js                  # テスト
node test/serve.js                # http://localhost:8766/ で画面確認
```

## 設定（`scripts/lib/pipeline.js` の DEFAULT_CFG）
- `threshold`: 急落のしきい値（%）。`node scripts/fetch.js --threshold=-4` で一時変更
- `minTurnover`: 20日平均の売買代金がこれ未満の銘柄は除く（既定 5,000万円）
- `maxPicks`: 1日の最大件数（40）
