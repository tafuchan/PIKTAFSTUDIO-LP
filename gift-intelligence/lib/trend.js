// Trend Detection（仕様 §27）
// 30日/90日/その前90日のmention数を比較し「定番」と「急上昇」を分ける。
// 日付はpublished_at優先、無ければcollected_at（Reportで欠損を明示する）。

const DAY = 86400000;

export function windowCounts(mentionDates, now = Date.now()) {
  let d30 = 0, d90 = 0, prev90 = 0;
  for (const d of mentionDates) {
    if (!d) continue;
    const age = (now - new Date(d).getTime()) / DAY;
    if (age <= 30) d30++;
    if (age <= 90) d90++;
    else if (age <= 180) prev90++;
  }
  return { d30, d90, prev90 };
}

/**
 * trend_score 0..100:
 *   50 = 横ばい。直近90日が前90日より多いほど100へ、減っているほど0へ。
 *   直近30日の密度ボーナスで「今まさに伸びている」を強調。
 */
export function trendScore({ d30, d90, prev90 }) {
  if (d90 === 0 && prev90 === 0) return 0; // 古い投稿しかない
  const growth = (d90 - prev90) / Math.max(1, prev90);       // -1..∞
  const base = 50 + 50 * Math.tanh(growth / 2);              // 0..100
  const momentum = d90 > 0 ? (d30 / d90) * 20 : 0;           // 直近集中ボーナス最大20
  return Math.round(Math.min(100, base * 0.85 + momentum));
}

/** gift_scores行にトレンド指標を書き込む */
export function applyTrends(scoreRows, db, now = Date.now()) {
  const postById = new Map(db.posts.map((p) => [p.id, p]));
  const datesByProduct = new Map();
  for (const m of db.mentions) {
    const post = postById.get(m.post_id);
    const d = post?.published_at || post?.collected_at || null;
    if (!datesByProduct.has(m.product_id)) datesByProduct.set(m.product_id, []);
    datesByProduct.get(m.product_id).push(d);
  }
  for (const row of scoreRows) {
    const c = windowCounts(datesByProduct.get(row.product_id) || [], now);
    row.mentions_30d = c.d30;
    row.mentions_90d = c.d90;
    row.mentions_prev_90d = c.prev90;
    row.trend_score = trendScore(c);
  }
  return scoreRows;
}
