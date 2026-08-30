// Amazon検索アフィリエイトリンクを全商品に付与する。
//   node scripts/enrich-amazon.js
//
// PA-API利用資格（売上実績）が出るまでの暫定運用:
//   - ASIN・画像は取得しない（規約上PA-API以外で画像は使えない）
//   - 検索リンク https://www.amazon.co.jp/s?k=<商品名>&tag=okurune-22 を
//     metadata.amazon.search_url に保存（クリック後24時間の購入が紹介料対象）
//   - 記事では「Amazonで見る」ボタンとして使う。画像は楽天CDN側を使う
import { loadTable, saveTable, nowIso } from '../lib/store.js';
import { searchName } from './enrich-images.js';
import { normalizeText } from '../lib/normalize.js';
import { pathToFileURL } from 'node:url';

export const AMAZON_ASSOCIATE_TAG = 'okurune-22';

export function amazonSearchUrl(product) {
  const kw = searchName([product.canonical_brand, product.canonical_name].filter(Boolean).join(' '));
  if (!kw) return null;
  return `https://www.amazon.co.jp/s?k=${encodeURIComponent(kw)}&tag=${AMAZON_ASSOCIATE_TAG}`;
}

export function enrichAmazon() {
  const products = loadTable('products');
  let added = 0, skipped = 0;
  for (const p of products) {
    // 汎用名のみ（ブランド無し・短い名前）は検索結果が無関係になるためスキップ
    if (!p.canonical_brand && normalizeText(p.canonical_name).replace(/ /g, '').length < 5) { skipped++; continue; }
    const url = amazonSearchUrl(p);
    if (!url) { skipped++; continue; }
    p.metadata = { ...p.metadata, amazon: { search_url: url, tag: AMAZON_ASSOCIATE_TAG, kind: 'search_link', generated_at: nowIso() } };
    added++;
  }
  saveTable('products', products);
  console.log(`Amazon検索リンク付与: ${added} / スキップ(汎用名): ${skipped} / 合計: ${products.length}`);
  return { added, skipped };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) enrichAmazon();
