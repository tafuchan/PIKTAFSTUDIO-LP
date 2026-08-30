// Collection Report + Data Quality Report を reports/ にmarkdownで出力する。
//   node scripts/report.js [出力ファイル名]
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { loadDb, REPORTS_DIR, nowIso } from '../lib/store.js';
import { ALL_CONTEXT } from '../lib/score.js';

const db = loadDb();
const lines = [];
const push = (s = '') => lines.push(s);
const productName = (id) => {
  const p = db.products.find((x) => x.id === id);
  return p ? `${p.canonical_brand ? p.canonical_brand + ' ' : ''}${p.canonical_name}` : id;
};

push(`# Gift Intelligence Collection Report`);
push(`生成: ${nowIso()}`);
push();

// Platform別
push(`## Platform別データ数`);
push(`| Platform | Posts | Mentions | 独立推薦単位 |`);
push(`|---|---|---|---|`);
const platforms = [...new Set(db.posts.map((p) => p.platform))];
for (const pf of platforms) {
  const posts = db.posts.filter((p) => p.platform === pf);
  const postIds = new Set(posts.map((p) => p.id));
  const ms = db.mentions.filter((m) => postIds.has(m.post_id));
  const units = new Set(posts.map((p) => p.crosspost_group_id || `post:${p.id}`));
  push(`| ${pf} | ${posts.length} | ${ms.length} | ${units.size} |`);
}
push();
push(`## 全体`);
push(`- Posts: ${db.posts.length} / Mentions: ${db.mentions.length} / Products: ${db.products.length} / Creators: ${db.creators.length} / Creator Groups: ${db.creator_groups.length}`);
push(`- Crosspost Groups: ${db.crosspost_groups.length} / Merge Review待ち: ${db.merge_candidates.filter((m) => m.status === 'pending').length}`);
push(`- Collection Runs: ${db.collection_runs.length}`);
push();

// TOP10（ブランド不明×汎用名の商品はランキングから除外: 「香水」「マフラー」等）
const isGeneric = (id) => {
  const p = db.products.find((x) => x.id === id);
  return p && !p.canonical_brand && (p.canonical_name || '').length < 6;
};
const all = db.gift_scores
  .filter((s) => s.context_key === ALL_CONTEXT && !isGeneric(s.product_id))
  .sort((a, b) => b.gift_score - a.gift_score);
push(`## よく登場した商品 TOP10（Gift Score / all context）`);
push(`| # | 商品 | GiftScore | 独立推薦 | Creator群 | 媒体数 | Trend |`);
push(`|---|---|---|---|---|---|---|`);
all.slice(0, 10).forEach((s, i) => {
  push(`| ${i + 1} | ${productName(s.product_id)} | ${s.gift_score} | ${s.crosspost_adjusted_count} | ${s.unique_creator_group_count} | ${s.platform_count} | ${s.trend_score} |`);
});
push();

// 急上昇
push(`## 急上昇商品 TOP10（trend_score）`);
const trending = [...all].filter((s) => s.mentions_90d > 0).sort((a, b) => b.trend_score - a.trend_score);
trending.slice(0, 10).forEach((s, i) => {
  push(`${i + 1}. ${productName(s.product_id)} — trend ${s.trend_score}（直近30日:${s.mentions_30d} / 90日:${s.mentions_90d} / 前90日:${s.mentions_prev_90d}）`);
});
push();

// 複数媒体
push(`## 3媒体以上で登場した商品`);
const multi = all.filter((s) => s.platform_count >= 3);
if (multi.length === 0) push(`（該当なし。2媒体登場: ${all.filter((s) => s.platform_count === 2).map((s) => productName(s.product_id)).join('、') || 'なし'}）`);
for (const s of multi) push(`- ${productName(s.product_id)}（${s.platform_count}媒体, GiftScore ${s.gift_score}）`);
push();

// 記事候補
push(`## Article Candidates`);
push(`| # | context | タイトル案 | Score | 商品数 | 推薦源 | 媒体 |`);
push(`|---|---|---|---|---|---|---|`);
db.article_candidates.slice(0, 15).forEach((c, i) => {
  push(`| ${i + 1} | ${c.context_key} | ${c.suggested_title} | ${c.article_score} | ${c.candidate_product_ids.length} | ${c.unique_creator_count} | ${c.platform_count} |`);
});
push();

// データ品質
push(`## データ品質 Report`);
const noDate = db.posts.filter((p) => !p.published_at).length;
const noMetrics = db.posts.filter((p) => p.views == null && p.likes == null && p.saves == null && p.reposts == null).length;
const noPrice = db.mentions.filter((m) => m.observed_price_jpy == null).length;
const lowConf = db.mentions.filter((m) => m.extraction_confidence < 0.6).length;
const unverified = db.posts.filter((p) => p.verification !== 'browser_verified').length;
push(`- published_at不明のpost: ${noDate}/${db.posts.length}（Recency/Trendはcollected_at代用）`);
push(`- 指標が一切取れなかったpost: ${noMetrics}/${db.posts.length}`);
push(`- 価格観測なしのmention: ${noPrice}/${db.mentions.length}（価格は推測しない方針）`);
push(`- extraction_confidence<0.6のmention: ${lowConf}`);
push(`- ブラウザ未検証のpost: ${unverified}/${db.posts.length}`);
push(`- 商品Merge/Creator/Crosspost レビュー待ち: ${db.merge_candidates.filter((m) => m.status === 'pending').length}件（data/merge_candidates.json）`);
push();
push(`### Run notes（取得制約）`);
for (const r of db.collection_runs) {
  if (r.notes || r.status !== 'done') push(`- [${r.platform ?? 'multi'}] ${r.query ?? ''}: ${r.status}${r.notes ? ' — ' + r.notes : ''}`);
}

mkdirSync(REPORTS_DIR, { recursive: true });
const out = join(REPORTS_DIR, process.argv[2] || `report_${new Date().toISOString().slice(0, 10)}.md`);
writeFileSync(out, lines.join('\n') + '\n', 'utf8');
console.log(out);
