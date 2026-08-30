// 媒体固有Metricsの正規化（仕様 §15）
// 媒体間で数字を直接比較せず、媒体内での相対位置を0..100へ写像する。
// 取得できない指標は null のまま扱い、推測しない。

/** 媒体ごとの主要指標（この順で最初に存在する値を代表値に使う） */
export const PRIMARY_METRIC = {
  tiktok: ['views', 'likes'],
  instagram: ['likes', 'saves'],
  lemon8: ['saves', 'likes'],
  pinterest: ['saves', 'reposts'],
  youtube: ['views', 'likes'],
  threads: ['likes', 'reposts'],
  x: ['likes', 'reposts'],
  rakuten_room: ['likes'],
  web: [],
};

export function primaryMetricValue(post) {
  const keys = PRIMARY_METRIC[post.platform] || ['likes'];
  for (const k of keys) {
    if (post[k] != null) return { key: k, value: post[k] };
  }
  return null;
}

/**
 * normalized_engagement_score (0..100)
 * 同一platform内の対数スケール順位で正規化。データが1件しかない場合は50。
 * @param posts 全posts（分布の母集団）
 * @returns Map<post_id, number|null>  指標が全く無いpostはnull
 */
export function normalizedEngagement(posts) {
  const byPlatform = new Map();
  for (const p of posts) {
    const m = primaryMetricValue(p);
    if (!m) continue;
    if (!byPlatform.has(p.platform)) byPlatform.set(p.platform, []);
    byPlatform.get(p.platform).push({ id: p.id, v: Math.log10(1 + m.value) });
  }
  const out = new Map();
  for (const p of posts) out.set(p.id, null);
  for (const [, arr] of byPlatform) {
    const vs = arr.map((x) => x.v);
    const min = Math.min(...vs), max = Math.max(...vs);
    for (const { id, v } of arr) {
      out.set(id, max === min ? 50 : Math.round(((v - min) / (max - min)) * 100));
    }
  }
  return out;
}
