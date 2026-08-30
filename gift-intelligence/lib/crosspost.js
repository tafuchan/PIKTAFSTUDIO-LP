// Crosspost Detection（仕様 §13）
// 同一creator_groupが同じ内容を複数SNSへ転載したものを1推薦に束ねる。
// fingerprint = 商品構成（product_id集合を順序付きで連結）のハッシュ。
// 判定: 同じcreator_group ×（商品構成が同一 or ほぼ同一）× 投稿日が近い(±14日 or 不明)。
import { createHash } from 'node:crypto';

export const CROSSPOST_WINDOW_DAYS = 14;

/** 投稿のcontent_fingerprintを作る（mentionsのproduct_idを rank順で連結） */
export function contentFingerprint(postMentions) {
  const ids = [...postMentions]
    .sort((a, b) => (a.rank_in_post ?? 999) - (b.rank_in_post ?? 999))
    .map((m) => m.product_id);
  if (ids.length === 0) return null;
  return createHash('sha1').update(ids.join('|')).digest('hex').slice(0, 16);
}

/** 商品集合のJaccard類似度 */
export function productSetSimilarity(mentionsA, mentionsB) {
  const a = new Set(mentionsA.map((m) => m.product_id));
  const b = new Set(mentionsB.map((m) => m.product_id));
  if (a.size === 0 || b.size === 0) return 0;
  let inter = 0;
  for (const x of a) if (b.has(x)) inter++;
  return inter / (a.size + b.size - inter);
}

function daysBetween(a, b) {
  if (!a || !b) return null; // 日付不明は「近い」とみなさず、fingerprint一致時のみ束ねる
  return Math.abs(new Date(a) - new Date(b)) / 86400000;
}

/**
 * 全postsに対しcrosspost groupを割り当てる。
 * @param posts gift_posts配列（creator_group_id, published_at, content_fingerprint済み）
 * @param mentionsByPost Map<post_id, mentions[]>
 * @returns {{groups: object[], assignments: Map<post_id, group_id>, reviews: Array}}
 */
export function detectCrossposts(posts, mentionsByPost, nextGroupId) {
  const groups = [];
  const assignments = new Map();
  const reviews = [];
  const byGroup = new Map(); // creator_group_id -> posts[]
  for (const p of posts) {
    const key = p.creator_group_id || `solo:${p.id}`;
    if (!byGroup.has(key)) byGroup.set(key, []);
    byGroup.get(key).push(p);
  }
  for (const [, gPosts] of byGroup) {
    if (gPosts.length < 2) continue;
    // クラスタリング（貪欲）: 先行postと一致すれば同group
    const clusters = [];
    for (const p of gPosts) {
      const pm = mentionsByPost.get(p.id) || [];
      let placed = false;
      for (const cl of clusters) {
        const head = cl[0];
        const hm = mentionsByPost.get(head.id) || [];
        const sameFp = p.content_fingerprint && p.content_fingerprint === head.content_fingerprint;
        const sim = productSetSimilarity(pm, hm);
        const dd = daysBetween(p.published_at, head.published_at);
        const dateNear = dd == null ? sameFp : dd <= CROSSPOST_WINDOW_DAYS;
        if ((sameFp && dateNear) || (sim >= 0.8 && dd != null && dd <= CROSSPOST_WINDOW_DAYS)) {
          cl.push(p); placed = true; break;
        }
        // 別日・同一商品構成 → 別企画の可能性。人間レビューへ。
        if (sameFp && dd != null && dd > CROSSPOST_WINDOW_DAYS) {
          reviews.push({ kind: 'crosspost', left_id: head.id, right_id: p.id, similarity: 1, reason: `同一商品構成だが${Math.round(dd)}日離れている` });
        }
      }
      if (!placed) clusters.push([p]);
    }
    for (const cl of clusters) {
      if (cl.length < 2) continue;
      const gid = nextGroupId();
      groups.push({ id: gid, detection: 'auto', confidence: 0.9, review_status: 'unreviewed', notes: cl.map((p) => p.platform).join('+'), created_at: new Date().toISOString() });
      for (const p of cl) assignments.set(p.id, gid);
    }
  }
  return { groups, assignments, reviews };
}

/**
 * 独立推薦単位のリスト: crosspost groupは1件として数える。
 * @returns Array<{unitId, posts[]}> 各unitが「独立した1推薦」
 */
export function independentUnits(posts) {
  const map = new Map();
  for (const p of posts) {
    const key = p.crosspost_group_id || `post:${p.id}`;
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(p);
  }
  return [...map.entries()].map(([unitId, ps]) => ({ unitId, posts: ps }));
}
