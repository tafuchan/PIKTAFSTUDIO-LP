# Gift Intelligence Database

オクルネ／オクルネマガジンのための、SNS・Webギフト情報の構造化基盤。

**思想:** SNS投稿そのものを資産にするのではなく、SNSを市場調査センサーとして使い、
**商品（Entity）× 情報源（Evidence）× 推薦された事実（Mention）** をデータ資産にする。

```
SNS/Web検索 → 有力投稿発見 → 商品抽出 → Canonical Productへ統合
→ 推薦文脈を構造化 → Crosspost排除 → 独立推薦源を集計
→ Gift Score / Trend Score → Article Candidate → マガジン記事制作
```

## 構成

```
gift-intelligence/
  db/migrations/0001_init.sql   Supabase/PostgreSQL用schema（接続時にそのまま適用）
  lib/
    normalize.js   文字列正規化・ブランド表記揺れ辞書・類似度
    match.js       Product Matching（正規化→ブランド→類似度→URL/JAN→alias→レビュー）
    creators.js    Creator照合・Creator Group推定・Watchlist評価
    crosspost.js   Crosspost検出（fingerprint＋商品構成Jaccard＋日付窓）
    metrics.js     媒体固有Metricsの正規化（媒体内log順位→0-100）
    score.js       Gift Score（context_key別）
    trend.js       Trend Score（30/90/前90日比較）
    article.js     Article Candidate生成・Opportunity Score
    store.js       JSONファイルストア（data/*.json）
  scripts/
    import.js      inboxバッチJSON/CSVの取り込み（dedup・creator・crosspost込み）
    recompute.js   スコア・トレンド・記事候補の再計算
    report.js      Collection Report + データ品質Report出力
  data/            データ本体（= DBのJSON表現。DB接続後はここからimport）
  inbox/           収集した生バッチ（importの入力。取り込み後も監査用に残す）
  reports/         生成されたReport
  test/core.test.js
```

**DBについて:** このrepoは静的サイトでDBを持たないため、`data/*.json` がDB相当
（テーブル構造は `db/migrations/0001_init.sql` と1:1）。Supabase等の認証情報が
用意できたら migration を適用し、`data/*.json` を流し込むだけで移行できる。

**公開についての注意:** このrepoはGitHub Pagesで全ファイルが配信される。
`gift-intelligence/` 配下に認証情報は置かないこと（データJSONは公開されても
問題ない情報のみ: 公開投稿のURL・メタデータ・独自要約・スコア）。

## 使い方

```bash
cd gift-intelligence

# 1. 収集バッチを inbox/ に置いて取り込み
node scripts/import.js inbox/2026-08-30_lemon8.json

# CSVの場合（1行=1mention、配列は;区切り）
node scripts/import.js --csv inbox/mentions.csv

# 2. スコア再計算（crosspost→gift_score→trend→article candidates）
node scripts/recompute.js

# 3. レポート出力
node scripts/report.js

# テスト
node --test test/core.test.js
```

## 収集バッチJSON形式

```jsonc
{
  "run": {
    "collection_mode": "discovery",     // discovery / watchlist
    "platform": "lemon8",
    "query": "女友達 プレゼント 5000円",
    "status": "done",                   // done / partial / blocked
    "notes": "TikTokはログイン壁のため検索面のみ"  // 取得制約を正直に書く
  },
  "posts": [
    {
      "platform": "lemon8",
      "source_url": "https://www.lemon8-app.com/@xxx/123...",  // UNIQUE。重複は自動skip
      "creator_handle": "@xxx",
      "creator_name": "あかね🎁",
      "creator_followers": 3406,          // 見えた場合のみ
      "published_at": "2026-08-01",       // 不明ならnull（推測しない）
      "title_or_summary": "【予算5000円】女友達が本当に喜ぶ誕生日プレゼント4選",
      "content_type": "lemon8_post",
      "verification": "browser_verified", // browser_verified / search_sourced / unverified
      "metrics": { "likes": 47, "saves": 31 },  // 見えた指標のみ。推測禁止
      "items": [
        {
          "brand": "SHIRO",
          "name": "ホワイトリリー オードパルファン",
          "observed_price_jpy": 4180,     // 投稿に明記があった場合のみ
          "rank_in_post": 1,
          "recipient_tags": ["女友達", "女性"],
          "occasion_tags": ["誕生日"],
          "age_tags": ["20代"],
          "budget_tags": ["3000-5000"],
          "style_tags": ["おしゃれ", "自分では買わない"],
          "recommendation_reason": "見た目がギフト向きで、もらうと嬉しい定番として紹介",
          "sentiment": "positive",
          "extraction_confidence": 0.9
        }
      ]
    }
  ]
}
```

## 重要な設計判断

- **誤Merge防止:** 類似度0.90以上のみ自動統合。0.72〜0.90と「名前の包含関係
  （香り違い・サイズ違い等のバリアント示唆）」は `merge_candidates` に積んで
  人間/AIレビュー待ちにする。香り違い・色違い・限定版は別Productのまま。
- **Crosspost:** 同一creator_group × 同一商品構成fingerprint × 14日以内を
  1グループに束ね、スコア上は**独立推薦1件**として数える。同一構成でも
  14日以上離れていれば別企画の可能性としてレビュー行きにする。
- **数字の誠実さ:** 取得できなかった指標・日付・価格はnullのまま。推測しない。
  媒体間で数字を直接比較せず、媒体内log順位で0-100に正規化して使う。
- **著作物:** 保存するのはURL・メタデータ・商品・推薦文脈・独自要約のみ。
  投稿本文・画像・動画は保存/転載しない。
- **バズ1発対策:** engagementは平均値・重み15%に留め、独立Creator数(25%)と
  複数媒体(15%)を主軸にする。

## スコアの重み（実データを見て調整可）

Gift Score = CreatorDiversity 25% + Recency 20% + PlatformDiversity 15%
+ Engagement 15% + ContextConsistency 15% + Availability 10%
（trend_scoreは別軸で保持: 90日/前90日比較 + 直近30日ボーナス）

Article Score = EvidenceQuality 25% + 商品候補数 20% + CreatorDiversity 15%
+ Trend 15% + Seasonality 10% + Intent具体性 10% + 既存記事差別化 5%

## 商品画像（楽天APIエンリッチ）

```bash
# 1回だけ: キーを置く（gitignore済。Codemagic変数グループ「rakuten」と同じ値）
#   gift-intelligence/.env.local に
#   RAKUTEN_APP_ID=... / RAKUTEN_ACCESS_KEY=... / RAKUTEN_AFFILIATE_ID=...(任意)

node scripts/enrich-images.js            # 全未取得商品（1.2秒/件）
node scripts/enrich-images.js --limit 20 # お試し
```

- 楽天市場 商品検索API（okurune本体と同じ新endpoint・Origin=piktaf-studio.com）で
  画像URL・購入URL・価格・店舗を `products.metadata.rakuten` に保存し、
  画像本体を `images/<product_id>.jpg` にローカル保管する（`images/`はgitignore）。
- **公開サイトで画像を使うときは楽天CDNのURL＋楽天へのリンクをセットで**
  （規約準拠。media.jsのアフィリエイト書き換えと相性が良い）。ローカルjpgは内部参照用。
- マッチは保守的: ブランド語一致 × 商品名bigramカバレッジ>=0.7のみ採用。
  0.5〜0.7は `low_confidence: true` で保存されるので目視レビューして
  誤マッチは `metadata.rakuten` を消す。SNS投稿の画像は転載しない（§33）。
- SNSの投稿ビジュアルを見せたい場合はInstagram/TikTok/YouTubeの公式埋め込み
  （oEmbed）を使う。Lemon8は埋め込み非対応。

## 毎日のCollection運用

1. Query Rotation（例: 月=彼女/女性、火=男性/彼氏、水=出産祝い、木=結婚祝い、
   金=プチギフト、土=予算別、日=Creator Watchlist巡回）
2. Discovery（新規Creator/商品/Trend発見）と Watchlist（有力Creatorの新着確認）を併用
3. `import.js` → `recompute.js` → `report.js` を回し、Reportの
   「Merge Review待ち」を人間が確認
4. 目安: 1日30投稿前後 ≒ 150 mentions/日。件数より「同じ商品が独立に何度
   推薦されたか」を重視
