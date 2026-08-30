// Importer: inbox/のバッチJSON（またはCSV）をデータストアへ取り込む。
// 使い方:
//   node scripts/import.js inbox/2026-08-30_lemon8.json [...files]
//   node scripts/import.js --csv inbox/mentions.csv
// バッチ形式は README.md 参照。
import { readFileSync } from 'node:fs';
import { loadDb, saveDb, nextId, nowIso } from '../lib/store.js';
import { matchProduct, buildProduct, absorbObservation } from '../lib/match.js';
import { normalizeBrand, normalizeName } from '../lib/normalize.js';
import { findCreator, suggestCreatorGroup } from '../lib/creators.js';
import { contentFingerprint, detectCrossposts } from '../lib/crosspost.js';

export function importBatch(db, batch) {
  const stats = { posts_checked: 0, posts_added: 0, mentions_added: 0, products_added: 0, products_merged: 0, creators_added: 0, reviews: 0, skipped_existing: 0 };
  const runId = nextId('run');
  const run = {
    id: runId,
    started_at: batch.run?.started_at || nowIso(),
    finished_at: nowIso(),
    collection_mode: batch.run?.collection_mode || 'discovery',
    query: batch.run?.query || null,
    platform: batch.run?.platform || null,
    status: batch.run?.status || 'done',
    notes: batch.run?.notes || null,
  };

  for (const rawPost of batch.posts || []) {
    stats.posts_checked++;
    // 既登録URL判定
    if (db.posts.some((p) => p.source_url === rawPost.source_url)) { stats.skipped_existing++; continue; }

    // Creator
    let creatorId = null, groupId = null;
    if (rawPost.creator_handle || rawPost.creator_name) {
      const { creator } = findCreator(rawPost.platform, rawPost.creator_handle || rawPost.creator_name, db.creators);
      if (creator) {
        creatorId = creator.id;
        groupId = creator.creator_group_id;
        creator.last_checked_at = nowIso();
      } else {
        creatorId = nextId('cr');
        const newCreator = {
          id: creatorId,
          platform: rawPost.platform,
          handle: rawPost.creator_handle || null,
          profile_url: rawPost.creator_profile_url || null,
          display_name: rawPost.creator_name || rawPost.creator_handle || null,
          follower_count: rawPost.creator_followers ?? null,
          gift_relevance_score: null,
          source_quality_score: null,
          creator_group_id: null,
          watchlist: false,
          last_checked_at: nowIso(),
          created_at: nowIso(),
          updated_at: nowIso(),
        };
        // Creator Group推定（別platformの同一人物）
        const sug = suggestCreatorGroup(newCreator, db.creators);
        if (sug.groupOf) {
          if (!sug.groupOf.creator_group_id) {
            const gid = nextId('cg');
            db.creator_groups.push({ id: gid, display_name: sug.groupOf.display_name, notes: 'auto: handle一致', created_at: nowIso(), updated_at: nowIso() });
            sug.groupOf.creator_group_id = gid;
          }
          newCreator.creator_group_id = sug.groupOf.creator_group_id;
        } else if (sug.review) {
          db.merge_candidates.push({ id: nextId('mc'), kind: 'creator', left_id: creatorId, right_id: sug.review.id, similarity: null, ai_verdict: null, reason: 'handle/表示名が類似。同一人物か要確認', status: 'pending', created_at: nowIso(), resolved_at: null });
          stats.reviews++;
        }
        groupId = newCreator.creator_group_id;
        db.creators.push(newCreator);
        stats.creators_added++;
      }
    }

    // Post
    const postId = nextId('po');
    const post = {
      id: postId,
      platform: rawPost.platform,
      source_url: rawPost.source_url,
      external_post_id: rawPost.external_post_id || null,
      creator_id: creatorId,
      creator_group_id: groupId,
      published_at: normalizeDate(rawPost.published_at),
      collected_at: nowIso(),
      title_or_summary: rawPost.title_or_summary || null,
      content_type: rawPost.content_type || defaultContentType(rawPost.platform),
      views: rawPost.metrics?.views ?? null,
      likes: rawPost.metrics?.likes ?? null,
      comments: rawPost.metrics?.comments ?? null,
      saves: rawPost.metrics?.saves ?? null,
      shares: rawPost.metrics?.shares ?? null,
      reposts: rawPost.metrics?.reposts ?? null,
      discovery_query: rawPost.discovery_query || batch.run?.query || null,
      collection_run_id: runId,
      source_status: 'alive',
      verification: rawPost.verification || 'unverified',
      content_fingerprint: null,
      crosspost_group_id: null,
      raw_metadata: rawPost.raw_metadata || rawPost.metrics || {},
      created_at: nowIso(),
    };
    db.posts.push(post);
    stats.posts_added++;

    // Items → Products + Mentions
    const postMentions = [];
    for (const item of rawPost.items || []) {
      if (!item.name) continue;
      let productId;
      const res = matchProduct(item, db.products, db.product_aliases);
      if (res.decision === 'match') {
        productId = res.product.id;
        absorbObservation(res.product, item, nowIso());
        stats.products_merged++;
        // 新しい表記をaliasに記録
        const nb = normalizeBrand(item.brand || '');
        const aliasNorm = `${nb} ${normalizeName(item.name, nb)}`.trim();
        if (!db.product_aliases.some((a) => a.product_id === productId && a.normalized_alias === aliasNorm)) {
          db.product_aliases.push({ id: nextId('al'), product_id: productId, alias_brand: item.brand || null, alias_name: item.name, normalized_alias: aliasNorm, source_platform: rawPost.platform, created_at: nowIso() });
        }
      } else {
        productId = nextId('p');
        db.products.push(buildProduct(productId, item, nowIso()));
        stats.products_added++;
        if (res.decision === 'review') {
          db.merge_candidates.push({ id: nextId('mc'), kind: 'product', left_id: productId, right_id: res.reviewAgainst.id, similarity: Math.round(res.similarity * 100) / 100, ai_verdict: null, reason: '名前類似。同一商品/バリアントか要確認', status: 'pending', created_at: nowIso(), resolved_at: null });
          stats.reviews++;
        }
      }
      if (db.mentions.some((m) => m.post_id === postId && m.product_id === productId)) continue;
      const mention = {
        id: nextId('m'),
        post_id: postId,
        product_id: productId,
        rank_in_post: item.rank_in_post ?? null,
        observed_price_jpy: item.observed_price_jpy ?? null,
        recipient_tags: item.recipient_tags || [],
        occasion_tags: item.occasion_tags || [],
        age_tags: item.age_tags || [],
        relationship_tags: item.relationship_tags || [],
        style_tags: item.style_tags || [],
        budget_tags: item.budget_tags || [],
        recommendation_reason: item.recommendation_reason || null,
        context_summary: item.context_summary || null,
        sentiment: item.sentiment || 'positive',
        extraction_confidence: item.extraction_confidence ?? 0.5,
        created_at: nowIso(),
      };
      db.mentions.push(mention);
      postMentions.push(mention);
      stats.mentions_added++;
    }
    post.content_fingerprint = contentFingerprint(postMentions);
  }

  Object.assign(run, {
    posts_checked: stats.posts_checked,
    posts_added: stats.posts_added,
    mentions_added: stats.mentions_added,
    products_added: stats.products_added,
    products_merged: stats.products_merged,
    creators_added: stats.creators_added,
  });
  db.collection_runs.push(run);
  return stats;
}

/** DB全体でcrosspost検出をやり直す */
export function refreshCrossposts(db) {
  const mentionsByPost = new Map();
  for (const m of db.mentions) {
    if (!mentionsByPost.has(m.post_id)) mentionsByPost.set(m.post_id, []);
    mentionsByPost.get(m.post_id).push(m);
  }
  for (const p of db.posts) p.crosspost_group_id = null;
  db.crosspost_groups = [];
  const { groups, assignments, reviews } = detectCrossposts(db.posts, mentionsByPost, () => nextId('xp'));
  db.crosspost_groups = groups;
  for (const p of db.posts) {
    if (assignments.has(p.id)) p.crosspost_group_id = assignments.get(p.id);
  }
  for (const r of reviews) {
    if (!db.merge_candidates.some((m) => m.kind === 'crosspost' && m.left_id === r.left_id && m.right_id === r.right_id)) {
      db.merge_candidates.push({ id: nextId('mc'), ...r, ai_verdict: null, status: 'pending', created_at: nowIso(), resolved_at: null });
    }
  }
  return groups.length;
}

/** "2025/9/29に編集" のような表記ゆれをISO日付へ。解釈できなければnull（推測しない）。 */
export function normalizeDate(s) {
  if (!s) return null;
  if (!isNaN(new Date(s).getTime())) return s;
  const m = String(s).match(/(\d{4})[/\-年](\d{1,2})[/\-月](\d{1,2})/);
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
  return null;
}

function defaultContentType(platform) {
  return {
    tiktok: 'tiktok_video', instagram: 'instagram_post', lemon8: 'lemon8_post',
    pinterest: 'pinterest_pin', youtube: 'youtube_video', threads: 'threads_post',
    x: 'x_post', rakuten_room: 'rakuten_room_item', web: 'web_article',
  }[platform] || 'web_article';
}

/** 簡易CSV importer: ヘッダ行必須。1行=1 mention。配列カラムは;区切り。 */
export function csvToBatch(csvText) {
  const lines = csvText.split(/\r?\n/).filter((l) => l.trim());
  const header = parseCsvLine(lines[0]);
  const postsByUrl = new Map();
  for (const line of lines.slice(1)) {
    const cells = parseCsvLine(line);
    const row = Object.fromEntries(header.map((h, i) => [h, cells[i] ?? '']));
    if (!postsByUrl.has(row.source_url)) {
      postsByUrl.set(row.source_url, {
        platform: row.platform, source_url: row.source_url,
        creator_handle: row.creator_handle || null, creator_name: row.creator_name || null,
        published_at: row.published_at || null, title_or_summary: row.title_or_summary || null,
        content_type: row.content_type || null, discovery_query: row.discovery_query || null,
        metrics: {}, items: [],
      });
    }
    const post = postsByUrl.get(row.source_url);
    for (const k of ['views', 'likes', 'comments', 'saves', 'shares', 'reposts']) {
      if (row[k]) post.metrics[k] = Number(row[k]);
    }
    post.items.push({
      brand: row.brand || null, name: row.name,
      observed_price_jpy: row.observed_price_jpy ? Number(row.observed_price_jpy) : null,
      rank_in_post: row.rank_in_post ? Number(row.rank_in_post) : null,
      recipient_tags: splitTags(row.recipient_tags), occasion_tags: splitTags(row.occasion_tags),
      age_tags: splitTags(row.age_tags), relationship_tags: splitTags(row.relationship_tags),
      style_tags: splitTags(row.style_tags), budget_tags: splitTags(row.budget_tags),
      recommendation_reason: row.recommendation_reason || null,
      sentiment: row.sentiment || 'positive',
      extraction_confidence: row.extraction_confidence ? Number(row.extraction_confidence) : 0.5,
    });
  }
  return { run: { collection_mode: 'discovery', query: 'csv import', platform: null }, posts: [...postsByUrl.values()] };
}
function splitTags(s) { return s ? s.split(';').map((x) => x.trim()).filter(Boolean) : []; }
function parseCsvLine(line) {
  const out = []; let cur = '', inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQ) {
      if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (ch === '"') inQ = false;
      else cur += ch;
    } else if (ch === '"') inQ = true;
    else if (ch === ',') { out.push(cur); cur = ''; }
    else cur += ch;
  }
  out.push(cur);
  return out;
}

// CLI
import { pathToFileURL } from 'node:url';
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2);
  if (args.length === 0) { console.error('usage: node scripts/import.js [--csv] <file...>'); process.exit(1); }
  const isCsv = args[0] === '--csv';
  const files = isCsv ? args.slice(1) : args;
  const db = loadDb();
  for (const f of files) {
    const text = readFileSync(f, 'utf8');
    const batch = isCsv ? csvToBatch(text) : JSON.parse(text);
    const stats = importBatch(db, batch);
    console.log(`${f}: +${stats.posts_added} posts, +${stats.mentions_added} mentions, +${stats.products_added} products (merged ${stats.products_merged}, skipped ${stats.skipped_existing}, reviews ${stats.reviews})`);
  }
  const xp = refreshCrossposts(db);
  console.log(`crosspost groups: ${xp}`);
  saveDb(db);
}
