// Article Candidate（仕様 §28-31）
// gift_scoresのcontext_keyを束ね、「オクルネマガジンで何を書くべきか」を発見する。
import { ALL_CONTEXT } from './score.js';

export const ARTICLE_WEIGHTS = {
  evidence_quality: 0.25,
  product_count: 0.20,
  creator_diversity: 0.15,
  trend: 0.15,
  seasonality: 0.10,
  intent_specificity: 0.10,
  differentiation: 0.05,
};

/** 季節性: occasionと現在月の距離（今〜2ヶ月先が書きどき） */
const SEASONAL = {
  'クリスマス': [11, 12], '母の日': [4, 5], '父の日': [5, 6], 'バレンタイン': [1, 2],
  'ホワイトデー': [2, 3], '敬老の日': [8, 9], '就職祝い': [2, 3], '入学祝い': [2, 3],
  '卒業祝い': [2, 3], 'ハロウィン': [9, 10],
};

export function seasonalityScore(occasion, month) {
  const ms = SEASONAL[occasion];
  if (!ms) return 60; // 通年ネタは中立
  return ms.includes(month) ? 100 : ms.includes(((month % 12) + 1)) ? 80 : 20;
}

function budgetRange(budgetTag) {
  if (!budgetTag || budgetTag === 'all') return [null, null];
  const m = budgetTag.match(/^(\d+)-(\d+)$/);
  if (m) return [Number(m[1]), Number(m[2])];
  const single = budgetTag.match(/^(\d+)$/);
  if (single) return [null, Number(single[1])];
  return [null, null];
}

/**
 * context_keyごとに集計してarticle_candidatesを生成する。
 * @param scoreRows applyTrends済みのgift_scores
 */
export function generateArticleCandidates(scoreRows, db, opts = {}) {
  const now = opts.now ?? Date.now();
  const month = new Date(now).getMonth() + 1;
  const minProducts = opts.minProducts ?? 3;
  const existingTitles = (opts.existingArticles ?? []).map((a) => a.title || '').join(' ');

  const byCtx = new Map();
  for (const r of scoreRows) {
    if (r.context_key === ALL_CONTEXT) continue;
    if (!byCtx.has(r.context_key)) byCtx.set(r.context_key, []);
    byCtx.get(r.context_key).push(r);
  }

  const candidates = [];
  for (const [ctx, rows] of byCtx) {
    const [recipient, occasion, budget] = ctx.split('|');
    // 具体性が全くないcontextはスキップ
    const specific = [recipient, occasion, budget].filter((x) => x !== 'all').length;
    if (specific === 0) continue;
    const strong = rows.filter((r) => r.crosspost_adjusted_count >= 1).sort((a, b) => b.gift_score - a.gift_score);
    if (strong.length < minProducts) continue;

    const evidence = strong.reduce((a, r) => a + r.evidence_count, 0);
    const creators = strong.reduce((a, r) => a + r.unique_creator_group_count, 0);
    const platforms = Math.max(...strong.map((r) => r.platform_count));
    const avgScore = strong.reduce((a, r) => a + r.gift_score, 0) / strong.length;
    const avgTrend = strong.reduce((a, r) => a + r.trend_score, 0) / strong.length;

    const evidenceQuality = Math.min(100, avgScore * 1.1);
    const productCount = Math.min(100, (strong.length / 8) * 100);
    const creatorDiv = Math.min(100, (creators / 15) * 100);
    const seasonality = seasonalityScore(occasion === 'all' ? null : occasion, month);
    const intent = specific === 3 ? 100 : specific === 2 ? 75 : 45;
    const differentiation = existingTitles && recipient !== 'all' && existingTitles.includes(recipient) ? 50 : 80;

    const articleScore =
      evidenceQuality * ARTICLE_WEIGHTS.evidence_quality +
      productCount * ARTICLE_WEIGHTS.product_count +
      creatorDiv * ARTICLE_WEIGHTS.creator_diversity +
      avgTrend * ARTICLE_WEIGHTS.trend +
      seasonality * ARTICLE_WEIGHTS.seasonality +
      intent * ARTICLE_WEIGHTS.intent_specificity +
      differentiation * ARTICLE_WEIGHTS.differentiation;

    const [bmin, bmax] = budgetRange(budget);
    candidates.push({
      context_key: ctx,
      suggested_title: buildTitle(recipient, occasion, budget),
      article_angle: `複数SNSで独立した${creators}推薦源が確認できた商品${strong.length}件を、SNS横断データで裏付けて紹介する`,
      target_reader: recipient === 'all' ? null : `${recipient}へ贈る読者`,
      occasion: occasion === 'all' ? null : occasion,
      recipient: recipient === 'all' ? null : recipient,
      budget_min: bmin,
      budget_max: bmax,
      candidate_product_ids: strong.map((r) => r.product_id),
      evidence_count: evidence,
      unique_creator_count: creators,
      platform_count: platforms,
      article_score: Math.round(articleScore * 10) / 10,
      reason: `商品${strong.length}件 / evidence ${evidence} / 独立推薦源${creators} / 最大${platforms}媒体 / 平均GiftScore ${Math.round(avgScore)}`,
      status: 'proposed',
      generated_at: new Date(now).toISOString(),
    });
  }
  return candidates.sort((a, b) => b.article_score - a.article_score);
}

function buildTitle(recipient, occasion, budget) {
  const parts = [];
  if (recipient !== 'all') parts.push(`${recipient}へ`);
  if (budget !== 'all') {
    const [min, max] = budgetRange(budget);
    parts.push(max ? (min ? `${fmt(min)}〜${fmt(max)}円で` : `${fmt(max)}円以内で`) : `予算${budget}で`);
  }
  parts.push(occasion !== 'all' ? `贈る${occasion}プレゼント` : '贈るプレゼント');
  return parts.join('') + '。SNSで本当に推されているもの';
}
function fmt(n) { return n.toLocaleString('ja-JP'); }
