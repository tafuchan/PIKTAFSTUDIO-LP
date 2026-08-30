// Product Matching / Deduplication（仕様 §17-18）
// STEP1 正規化 → STEP2 ブランド一致 → STEP3 名前類似度 → STEP4 URL/JAN/型番
// → STEP5 alias table → STEP6 AI判定は行わず merge_candidates に積んで人間/AIレビューへ。
import { normalizeBrand, normalizeName, diceSimilarity, looksLikeVariantPair } from './normalize.js';

export const MATCH_THRESHOLD = 0.90;   // 自動同一判定
export const REVIEW_THRESHOLD = 0.72;  // これ以上は merge_candidates へ

/**
 * 抽出された商品 {brand, name, official_url?, jan_code?} を既存productsに照合する。
 * @returns {{decision:'match'|'review'|'new', product?:object, similarity?:number, reviewAgainst?:object}}
 */
export function matchProduct(raw, products, aliases) {
  const nb = normalizeBrand(raw.brand || '');
  const nn = normalizeName(raw.name || '', nb);
  if (!nn) return { decision: 'new' };

  // STEP 4 を先に: 強い識別子（URL/JAN）完全一致
  for (const p of products) {
    if (raw.jan_code && p.jan_code && raw.jan_code === p.jan_code) {
      return { decision: 'match', product: p, similarity: 1 };
    }
    if (raw.official_url && p.official_url && stripUrl(raw.official_url) === stripUrl(p.official_url)) {
      return { decision: 'match', product: p, similarity: 1 };
    }
  }

  // STEP 5: alias完全一致
  const aliasKey = `${nb} ${nn}`.trim();
  for (const a of aliases) {
    if (a.normalized_alias === aliasKey || a.normalized_alias === nn) {
      const p = products.find((x) => x.id === a.product_id);
      if (p) return { decision: 'match', product: p, similarity: 1 };
    }
  }

  // STEP 2+3: ブランド一致グループ内で名前類似
  let best = null, bestSim = 0;
  for (const p of products) {
    const brandOk = !nb || !p.normalized_brand || nb === p.normalized_brand;
    const sim = diceSimilarity(nn, p.normalized_name) * (brandOk ? 1 : 0.4);
    if (sim > bestSim) { bestSim = sim; best = p; }
  }

  if (best && bestSim >= MATCH_THRESHOLD) {
    // Mergeしすぎ防止: 名前が包含関係（バリアント示唆）ならレビューに回す
    if (bestSim < 1 && looksLikeVariantPair(nn, best.normalized_name)) {
      return { decision: 'review', reviewAgainst: best, similarity: bestSim };
    }
    return { decision: 'match', product: best, similarity: bestSim };
  }
  if (best && bestSim >= REVIEW_THRESHOLD) {
    return { decision: 'review', reviewAgainst: best, similarity: bestSim };
  }
  return { decision: 'new' };
}

function stripUrl(u) {
  try {
    const url = new URL(u);
    return (url.origin + url.pathname).replace(/\/$/, '').toLowerCase();
  } catch { return String(u).toLowerCase(); }
}

/** 新規Canonical Productレコードを作る */
export function buildProduct(id, raw, nowIso) {
  const nb = normalizeBrand(raw.brand || '');
  const nn = normalizeName(raw.name || '', nb);
  return {
    id,
    canonical_brand: raw.brand || null,
    canonical_name: raw.name,
    normalized_brand: nb || null,
    normalized_name: nn,
    category: raw.category || null,
    subcategory: raw.subcategory || null,
    price_min_jpy: raw.observed_price_jpy ?? raw.price_min_jpy ?? null,
    price_max_jpy: raw.observed_price_jpy ?? raw.price_max_jpy ?? null,
    official_url: raw.official_url || null,
    purchase_url: raw.purchase_url || null,
    description: raw.description || null,
    status: raw.status || 'unknown',
    parent_product_id: null,
    variant_type: null,
    jan_code: raw.jan_code || null,
    metadata: {},
    created_at: nowIso,
    updated_at: nowIso,
  };
}

/** 既存productに観測情報を吸収させる（価格レンジ拡張・URL補完） */
export function absorbObservation(product, raw, nowIso) {
  const price = raw.observed_price_jpy;
  if (price != null) {
    if (product.price_min_jpy == null || price < product.price_min_jpy) product.price_min_jpy = price;
    if (product.price_max_jpy == null || price > product.price_max_jpy) product.price_max_jpy = price;
  }
  if (!product.official_url && raw.official_url) product.official_url = raw.official_url;
  if (!product.category && raw.category) product.category = raw.category;
  product.updated_at = nowIso;
}
