# TikTokカルーセル収集 引き継ぎ文書（Codex用）

作成: 2026-08-30 / 引き継ぎ元: Claude Code（ブラウザペイン不安定のため移管）

## 背景（1分で分かる文脈）

このディレクトリ（gift-intelligence/）は、SNSのギフト紹介投稿から
「商品・推薦文脈」を構造化して貯めるDB。TikTokのカルーセル（写真）投稿は
ギフトまとめの宝庫だが、**Web版は写真投稿がログイン壁で本文・画像が取れない**。
そこで「投稿一覧→投稿URL取得→カルーセル画像を一括DL→画像から商品抽出」の
経路を作る。今回はその試験運用。

## ゴール（Phase A: Codexの担当）

対象アカウント **@arinacute7635**（ありな / フォロワー765 / 総いいね93.6K /
ギフト・トレンドまとめ系）について:

1. 投稿一覧を取得し、ギフト関連のカルーセル投稿を **最大10件** 選ぶ
   （タイトルに プレゼント/ギフト/誕生日/予算 等を含むもの優先）
2. 各投稿の カルーセル画像全枚数をDLして
   `images/tiktok/<post_id>/01.jpg, 02.jpg...` に保存（images/はgitignore済み）
3. 各投稿のメタデータを `inbox/tiktok_arinacute7635_raw.json` に保存:

```json
{
  "account": "arinacute7635",
  "collected_at": "2026-08-30",
  "posts": [
    {
      "post_id": "7657098928575237384",
      "source_url": "https://www.tiktok.com/@arinacute7635/photo/7657098928575237384",
      "title_or_caption": "実際に取得できたキャプション",
      "published_at": "2026-06-30",
      "metrics": { "likes": 1576, "comments": null, "saves": null, "shares": null },
      "image_count": 12,
      "image_dir": "images/tiktok/7657098928575237384/",
      "extraction_note": "取得手段と取れなかった項目を正直に"
    }
  ],
  "method_notes": "使った経路・制約を記載"
}
```

Phase B（商品抽出→gift_mentions化）はClaudeが画像を読んで行うので、
**Codexは画像の中身の商品名を推測して書かなくてよい**（書くなら確信があるもののみ）。

## 判明済みの技術情報（再調査不要）

- **TikTok Web**: 検索ページ・動画ページはログインなしで閲覧可（いいね数・日付取得可）。
  **写真(/photo/)ページと プロフィールの投稿グリッドはログイン壁**。
  写真ページは `__UNIVERSAL_DATA_FOR_REHYDRATION__` JSONも空になる。
- **oEmbed** (`https://www.tiktok.com/oembed?url=<post_url>`): ログイン不要で
  title と thumbnail_url だけ取れる。カルーセル全画像は取れない。
- **tikwm.com**（ダウンローダーAPI）:
  - `https://www.tikwm.com/api/?url=<post_url>` → 写真投稿なら `data.images[]`
    （CDN直URL配列）、`data.title`、`digg_count` 等が返る（はず）
  - `https://www.tikwm.com/api/user/posts?unique_id=arinacute7635&count=33`
    → 投稿一覧（はず）
  - **素のcurlはCloudflareチャレンジで弾かれる**（"Just a moment..."）。
    実ブラウザ相当（Playwright等）なら通る見込み。
- 代替ダウンローダー: ssstik.io / snaptik.app / dlpanda 等（UI操作型）。
- 既知のギフト投稿例: `/@arinacute7635/photo/7657098928575237384`
  「センスいいって褒められる♡予算別ギフト28選」（検索面表示: 1576いいね, 6-30投稿）

## 実装の推奨ルート

1. **Playwright（Node）** を使う（無ければ `npm i playwright` + chromium）。
   tikwm.com をブラウザで開いてCF通過 → 同一コンテキストで上記APIを
   `page.evaluate(fetch)` するのが最短。
2. tikwmがダメなら ssstik 等のUI操作型を試す。
3. どれも不可なら、その旨を method_notes に書いて中断（無理をしない）。

## 禁止事項（must）

- 対話型CAPTCHAを自動解決しない（出たら中断して報告）
- TikTokやダウンローダーへの**ログイン・認証情報入力をしない**
- 大量取得しない（今回は1アカウント・最大10投稿。リクエスト間隔1秒以上）
- DLした画像を**公開物として再利用しない**（リポジトリにコミットしない。
  分析後に構造化データだけ残す方針。images/はgitignore済みだが念のため確認）
- 取れなかった数値・日付を推測で埋めない（nullにして extraction_note に書く）

## 完了報告に含めるもの

- 取得できた投稿数 / 画像枚数 / 使った経路
- 取れなかったもの（metricsの欠け・失敗したAPI等）
- `inbox/tiktok_arinacute7635_raw.json` と `images/tiktok/` のパス

## 引き継ぎ後の流れ（参考・Codexは実施不要）

Claude側で: 画像Read→商品・文脈抽出→ `inbox/2026-08-30_tiktok_carousel.json`
（README.md記載のバッチ形式）→ `node scripts/import.js` → enrich → recompute。
うまくいけば同方式を他のギフト系アカウント
（hana_diary__ / m_grace__trend / chuna_gift / nina_gift_mania / maru_gift__ /
nikori_giftidea / youthgakuen_）へ横展開する。
