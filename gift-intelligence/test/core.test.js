// node --test test/ で実行する最小テスト
import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeText, normalizeBrand, diceSimilarity } from '../lib/normalize.js';
import { matchProduct, buildProduct } from '../lib/match.js';
import { normalizeHandle, suggestCreatorGroup } from '../lib/creators.js';
import { contentFingerprint, productSetSimilarity, detectCrossposts, independentUnits } from '../lib/crosspost.js';
import { computeGiftScores, contextKeysOf, ALL_CONTEXT } from '../lib/score.js';
import { windowCounts, trendScore } from '../lib/trend.js';
import { generateArticleCandidates } from '../lib/article.js';
import { csvToBatch } from '../scripts/import.js';

test('normalizeText: NFKC・全角半角・記号', () => {
  assert.equal(normalizeText('ＳＨＩＲＯ　ホワイトリリー！'), 'shiro ホワイトリリー');
});

test('normalizeBrand: 表記揺れ辞書', () => {
  assert.equal(normalizeBrand('シロ'), 'shiro');
  assert.equal(normalizeBrand('ジョーマローン'), 'jo malone london');
  assert.equal(normalizeBrand('SHIRO'), 'shiro');
});

test('diceSimilarity: 同一・類似・非類似', () => {
  assert.equal(diceSimilarity('ホワイトリリー', 'ホワイトリリー'), 1);
  assert.ok(diceSimilarity('ホワイトリリー オードパルファン', 'ホワイトリリー オードパルファン 40ml') > 0.7);
  assert.ok(diceSimilarity('ホワイトリリー', 'サボン') < 0.3);
});

test('matchProduct: 同一商品はmatch、香り違いはmergeしない', () => {
  const now = new Date().toISOString();
  const products = [buildProduct('p_0001', { brand: 'SHIRO', name: 'ホワイトリリー オードパルファン' }, now)];
  const same = matchProduct({ brand: 'シロ', name: 'ホワイトリリー オードパルファン' }, products, []);
  assert.equal(same.decision, 'match');
  const scent = matchProduct({ brand: 'SHIRO', name: 'サボン オードパルファン' }, products, []);
  assert.notEqual(scent.decision, 'match'); // 香り違いを自動統合しない
});

test('matchProduct: alias経由でmatch', () => {
  const now = new Date().toISOString();
  const products = [buildProduct('p_0001', { brand: 'SHIRO', name: 'ホワイトリリー オードパルファン' }, now)];
  const aliases = [{ id: 'al_0001', product_id: 'p_0001', normalized_alias: 'shiro 香水 ホワイトリリー' }];
  const r = matchProduct({ brand: 'SHIRO', name: '香水 ホワイトリリー' }, products, aliases);
  assert.equal(r.decision, 'match');
});

test('creator group: 別platform同handleを同一人物と推定', () => {
  const existing = [{ id: 'cr_1', platform: 'tiktok', handle: 'gift_akane', display_name: 'あかね🎁' }];
  const sug = suggestCreatorGroup({ platform: 'lemon8', handle: 'gift.akane', display_name: 'あかね' }, existing);
  assert.ok(sug.groupOf || sug.review);
  assert.equal(normalizeHandle('@Gift.Akane'), 'giftakane');
});

test('crosspost: 同一商品構成×近い日付は束ね、独立単位は1になる', () => {
  const mA = [{ product_id: 'p_1', rank_in_post: 1 }, { product_id: 'p_2', rank_in_post: 2 }];
  const mB = [{ product_id: 'p_1', rank_in_post: 1 }, { product_id: 'p_2', rank_in_post: 2 }];
  const fp = contentFingerprint(mA);
  assert.equal(fp, contentFingerprint(mB));
  assert.equal(productSetSimilarity(mA, mB), 1);
  const posts = [
    { id: 'po_1', platform: 'tiktok', creator_group_id: 'cg_1', published_at: '2026-08-01', content_fingerprint: fp },
    { id: 'po_2', platform: 'lemon8', creator_group_id: 'cg_1', published_at: '2026-08-03', content_fingerprint: fp },
  ];
  const mbp = new Map([['po_1', mA], ['po_2', mB]]);
  let n = 0;
  const { groups, assignments } = detectCrossposts(posts, mbp, () => `xp_${++n}`);
  assert.equal(groups.length, 1);
  posts.forEach((p) => { p.crosspost_group_id = assignments.get(p.id); });
  assert.equal(independentUnits(posts).length, 1);
});

test('gift score: crosspost束ねで独立推薦は増えない', () => {
  const db = {
    products: [{ id: 'p_1', canonical_name: 'X', normalized_name: 'x', status: 'active' }],
    posts: [
      { id: 'po_1', platform: 'tiktok', creator_id: 'cr_1', creator_group_id: 'cg_1', published_at: '2026-08-01', crosspost_group_id: 'xp_1', likes: 100 },
      { id: 'po_2', platform: 'lemon8', creator_id: 'cr_2', creator_group_id: 'cg_1', published_at: '2026-08-02', crosspost_group_id: 'xp_1', saves: 50 },
    ],
    mentions: [
      { id: 'm_1', post_id: 'po_1', product_id: 'p_1', recipient_tags: ['女友達'], occasion_tags: ['誕生日'], budget_tags: ['3000-5000'] },
      { id: 'm_2', post_id: 'po_2', product_id: 'p_1', recipient_tags: ['女友達'], occasion_tags: ['誕生日'], budget_tags: ['3000-5000'] },
    ],
  };
  const rows = computeGiftScores(db);
  const allRow = rows.find((r) => r.context_key === ALL_CONTEXT);
  assert.equal(allRow.crosspost_adjusted_count, 1);
  assert.equal(allRow.unique_creator_group_count, 1);
  assert.equal(allRow.platform_count, 2);
  const ctxRow = rows.find((r) => r.context_key === '女友達|誕生日|3000-5000');
  assert.ok(ctxRow);
});

test('contextKeysOf: タグの直積 + all', () => {
  const keys = contextKeysOf({ recipient_tags: ['女友達'], occasion_tags: ['誕生日', 'お礼'], budget_tags: [] });
  assert.ok(keys.includes(ALL_CONTEXT));
  assert.ok(keys.includes('女友達|誕生日|all'));
  assert.ok(keys.includes('女友達|お礼|all'));
});

test('trend: 直近増加は50超、減少は50未満', () => {
  const now = Date.now();
  const recent = windowCounts(['2026-08-25', '2026-08-20', '2026-08-01', '2026-04-01'].map((d) => d), now);
  assert.ok(trendScore(recent) > 50);
  assert.ok(trendScore({ d30: 0, d90: 1, prev90: 5 }) < 50);
  assert.equal(trendScore({ d30: 0, d90: 0, prev90: 0 }), 0);
});

test('article candidates: 商品3件以上のcontextから生成', () => {
  const rows = ['p_1', 'p_2', 'p_3'].map((pid) => ({
    product_id: pid, context_key: '女友達|誕生日|3000-5000', evidence_count: 2,
    unique_creator_group_count: 2, platform_count: 2, crosspost_adjusted_count: 2,
    gift_score: 60, trend_score: 55,
  }));
  const cands = generateArticleCandidates(rows, { posts: [], mentions: [] });
  assert.equal(cands.length, 1);
  assert.ok(cands[0].suggested_title.includes('女友達'));
  assert.equal(cands[0].budget_min, 3000);
  assert.equal(cands[0].budget_max, 5000);
});

test('csv importer: 1行=1mention、同一URLは同一post', () => {
  const csv = [
    'platform,source_url,creator_handle,title_or_summary,likes,brand,name,recipient_tags,budget_tags',
    'lemon8,https://ex.com/a,@u1,"5000円ギフト",10,SHIRO,ホワイトリリー,女友達;彼女,3000-5000',
    'lemon8,https://ex.com/a,@u1,"5000円ギフト",10,Aesop,ハンドバーム,女友達,3000-5000',
  ].join('\n');
  const batch = csvToBatch(csv);
  assert.equal(batch.posts.length, 1);
  assert.equal(batch.posts[0].items.length, 2);
  assert.deepEqual(batch.posts[0].items[0].recipient_tags, ['女友達', '彼女']);
});
