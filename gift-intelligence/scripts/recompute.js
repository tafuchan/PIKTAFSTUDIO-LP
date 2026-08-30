// 再計算パイプライン: crosspost → gift_scores → trend → article_candidates
//   node scripts/recompute.js
import { loadDb, saveDb, nextId, nowIso } from '../lib/store.js';
import { refreshCrossposts } from './import.js';
import { computeGiftScores, ALL_CONTEXT } from '../lib/score.js';
import { applyTrends } from '../lib/trend.js';
import { generateArticleCandidates } from '../lib/article.js';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const db = loadDb();

const xp = refreshCrossposts(db);
let scores = computeGiftScores(db);
scores = applyTrends(scores, db);
db.gift_scores = scores;

// 既存記事（okurune/data/articles.json）と重複しない差別化スコアのため読み込む
let existingArticles = [];
const articlesJson = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'okurune', 'data', 'articles.json');
if (existsSync(articlesJson)) existingArticles = JSON.parse(readFileSync(articlesJson, 'utf8'));

const candidates = generateArticleCandidates(scores, db, { existingArticles });
// 既存candidateのstatusは維持しつつ入れ替え
const statusByCtx = new Map(db.article_candidates.map((c) => [c.context_key, c.status]));
db.article_candidates = candidates.map((c) => ({
  id: nextId('ac'),
  ...c,
  status: statusByCtx.get(c.context_key) && statusByCtx.get(c.context_key) !== 'proposed' ? statusByCtx.get(c.context_key) : c.status,
}));

saveDb(db);

const top = scores.filter((s) => s.context_key === ALL_CONTEXT).slice(0, 10);
console.log(`crosspost groups: ${xp}`);
console.log(`gift_scores rows: ${scores.length}`);
console.log(`article candidates: ${db.article_candidates.length}`);
console.log('--- TOP10 (all contexts) ---');
for (const s of top) {
  const p = db.products.find((x) => x.id === s.product_id);
  console.log(`${s.gift_score}\t${p?.canonical_brand ?? ''} ${p?.canonical_name}\t(units:${s.crosspost_adjusted_count}, platforms:${s.platform_count}, trend:${s.trend_score})`);
}
console.log(`recomputed at ${nowIso()}`);
