// 商品画像エンリッチ: 楽天市場 商品検索APIで各Canonical Productの
// 画像URL・購入URL・価格を取得し、metadata.rakuten に保存。画像本体は
// images/<product_id>.jpg にローカル保管する（images/はgitignore。公開サイトで
// 使う場合は楽天CDNのURLを楽天へのリンクとセットで使うこと=規約準拠）。
//
// 使い方:
//   node scripts/enrich-images.js [--limit N] [--dry-run] [--force]
//
// キーは .env.local（gitignore済）か環境変数から読む:
//   RAKUTEN_APP_ID=...      （Codemagic変数グループ「rakuten」と同じ値）
//   RAKUTEN_ACCESS_KEY=...
//   RAKUTEN_AFFILIATE_ID=...（任意）
//
// 誤画像は誤Mergeと同じくらい信頼を毀損するため、マッチは保守的に:
//   ブランド語が商品タイトルに含まれ、かつ商品名bigramカバレッジ>=0.7 のみ採用。
//   0.5〜0.7は low_confidence フラグ付きで保存（レビュー対象）。それ未満は保存しない。
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { loadTable, saveTable } from '../lib/store.js';
import { normalizeText } from '../lib/normalize.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const IMAGES_DIR = join(ROOT, 'images');
const ENDPOINT = 'https://openapi.rakuten.co.jp/ichibams/api/IchibaItem/Search/20260401';
const ORIGIN = 'https://piktaf-studio.com'; // 楽天ポータルのAllowed websites登録値
const INTERVAL_MS = 1200; // レート制限（1req/秒+余裕）

function loadEnv() {
  const env = { ...process.env };
  const f = join(ROOT, '.env.local');
  if (existsSync(f)) {
    for (const line of readFileSync(f, 'utf8').split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.+?)\s*$/);
      if (m && !env[m[1]]) env[m[1]] = m[2];
    }
  }
  return env;
}

/** 店舗の宣伝文（【】内・販促語）をタイトルから軽く除去 */
function cleanTitle(t) {
  return String(t)
    .replace(/【[^】]*】|［[^］]*］|《[^》]*》|＼[^／]*／|\[[^\]]*\]|（[^）]*）|\([^)]*\)/g, ' ')
    .replace(/送料無料|あす楽|ポイント\d*倍|公式|正規品|ラッピング無料|ギフト対応|翌日配送/g, ' ');
}

/** 我々の商品名のbigramが楽天タイトルにどれだけ含まれるか（0..1） */
function coverage(ourName, itemTitle) {
  const a = normalizeText(ourName).replace(/ /g, '');
  const b = normalizeText(cleanTitle(itemTitle)).replace(/ /g, '');
  if (a.length < 2 || !b) return 0;
  let hit = 0, total = 0;
  for (let i = 0; i < a.length - 1; i++) { total++; if (b.includes(a.slice(i, i + 2))) hit++; }
  return total ? hit / total : 0;
}

function brandInTitle(brand, itemTitle) {
  if (!brand) return true; // ブランド不明商品はカバレッジのみで判定（閾値は上げる）
  const b = normalizeText(brand).replace(/ /g, '');
  const t = normalizeText(itemTitle).replace(/ /g, '');
  return b.length > 0 && t.includes(b);
}

function scaledImage(url) {
  return url ? url.replace(/([?&]_ex=)\d+x\d+/, '$1400x400') : null;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** 検索キーワード用の商品名整形: 括弧内の別名・英名を除去し、API非対応文字を潰す */
function searchName(name) {
  return String(name)
    .replace(/（[^）]*）|\([^)]*\)/g, ' ')
    .replace(/[&＆/／|]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length >= 2) // 楽天APIは1文字トークンを弾く（wrong_parameter）
    .join(' ')
    .trim();
}

async function searchRakuten(env, keyword) {
  const q = new URLSearchParams({
    applicationId: env.RAKUTEN_APP_ID,
    accessKey: env.RAKUTEN_ACCESS_KEY,
    keyword,
    hits: '10',
    page: '1',
    sort: 'standard',
    formatVersion: '2',
  });
  if (env.RAKUTEN_AFFILIATE_ID) q.set('affiliateId', env.RAKUTEN_AFFILIATE_ID);
  const res = await fetch(`${ENDPOINT}?${q}`, {
    headers: { Origin: ORIGIN, Referer: `${ORIGIN}/` },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`HTTP ${res.status}: ${body.slice(0, 200)}`);
  }
  const json = await res.json();
  return json.Items || [];
}

function pickBest(product, items) {
  let best = null;
  for (const it of items) {
    const title = it.itemName || '';
    if (!brandInTitle(product.canonical_brand, title)) continue;
    let cov = coverage(searchName(product.canonical_name), title);
    // 価格サニティ: 観測価格帯から大きく外れる候補は減点（福袋・まとめ売り対策）
    if (product.price_min_jpy && it.itemPrice) {
      const ratio = it.itemPrice / product.price_min_jpy;
      if (ratio > 3 || ratio < 0.3) cov -= 0.15;
    }
    if (!best || cov > best.cov) best = { it, cov };
  }
  if (!best) return null;
  const threshold = product.canonical_brand ? 0.7 : 0.85; // ブランド不明はより厳格に
  const reviewFloor = product.canonical_brand ? 0.5 : 0.7;
  if (best.cov >= threshold) return { ...best, low_confidence: false };
  if (best.cov >= reviewFloor) return { ...best, low_confidence: true };
  return null;
}

async function downloadImage(url, productId) {
  const res = await fetch(url);
  if (!res.ok) return null;
  const buf = Buffer.from(await res.arrayBuffer());
  mkdirSync(IMAGES_DIR, { recursive: true });
  const file = join(IMAGES_DIR, `${productId}.jpg`);
  writeFileSync(file, buf);
  return file;
}

export async function enrichAll({ limit = Infinity, dryRun = false, force = false } = {}) {
  const env = loadEnv();
  if (!env.RAKUTEN_APP_ID || !env.RAKUTEN_ACCESS_KEY) {
    console.error('楽天APIキーが未設定です。gift-intelligence/.env.local に以下を書いてください:');
    console.error('  RAKUTEN_APP_ID=<Codemagic変数グループrakutenと同じ値>');
    console.error('  RAKUTEN_ACCESS_KEY=<同上>');
    console.error('  RAKUTEN_AFFILIATE_ID=<任意>');
    process.exitCode = 1;
    return null;
  }
  const products = loadTable('products');
  const targets = products.filter((p) => {
    if (!force && p.metadata?.rakuten) return false;      // 取得済みはスキップ
    if (!p.canonical_brand && normalizeText(p.canonical_name).replace(/ /g, '').length < 5) return false; // 汎用名は誤マッチ源
    return true;
  }).slice(0, limit);

  console.log(`対象 ${targets.length}/${products.length} 商品（取得済・汎用名スキップ）`);
  const stats = { matched: 0, low: 0, nomatch: 0, error: 0, images: 0 };
  let processed = 0;

  for (const p of targets) {
    const keyword = searchName([p.canonical_brand, p.canonical_name].filter(Boolean).join(' '));
    if (!keyword) { stats.nomatch++; continue; }
    try {
      const items = await searchRakuten(env, keyword);
      const best = pickBest(p, items);
      if (!best) {
        stats.nomatch++;
        p.metadata = { ...p.metadata, rakuten_checked_at: new Date().toISOString(), rakuten: null };
      } else {
        const it = best.it;
        const imageUrl = scaledImage((it.mediumImageUrls || [])[0] || null);
        p.metadata = {
          ...p.metadata,
          rakuten: {
            item_code: it.itemCode || null,
            item_url: it.itemUrl || null,
            affiliate_url: it.affiliateUrl || null,
            item_price: it.itemPrice ?? null,
            shop_name: it.shopName || null,
            image_url: imageUrl,
            match_coverage: Math.round(best.cov * 100) / 100,
            low_confidence: best.low_confidence,
            checked_at: new Date().toISOString(),
          },
        };
        if (!p.purchase_url && it.itemUrl) p.purchase_url = it.itemUrl;
        // 価格はマーケットプレイス転売値の可能性があるためprice_min/maxへは反映しない
        // （metadata.rakuten.item_priceに参考値として残る）
        if (p.status === 'unknown') p.status = 'active'; // 楽天で現在販売中
        best.low_confidence ? stats.low++ : stats.matched++;
        if (!dryRun && imageUrl) {
          const f = await downloadImage(imageUrl, p.id).catch(() => null);
          if (f) stats.images++;
        }
      }
    } catch (e) {
      stats.error++;
      console.error(`  ${p.id} ${keyword}: ${e.message}`);
      if (stats.error >= 5 && stats.matched + stats.low === 0) {
        console.error('連続失敗のため中断（キー/Origin設定を確認してください）');
        break;
      }
    }
    processed++;
    if (processed % 20 === 0) {
      if (!dryRun) saveTable('products', products);
      console.log(`  ${processed}/${targets.length} ... matched:${stats.matched} low:${stats.low} nomatch:${stats.nomatch}`);
    }
    await sleep(INTERVAL_MS);
  }
  if (!dryRun) saveTable('products', products);
  console.log(`完了: matched ${stats.matched} / low_confidence ${stats.low} / nomatch ${stats.nomatch} / error ${stats.error} / 画像保存 ${stats.images}`);
  console.log('low_confidenceは products.json の metadata.rakuten.low_confidence=true を確認して誤マッチを外すこと');
  return stats;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2);
  const limitIdx = args.indexOf('--limit');
  enrichAll({
    limit: limitIdx >= 0 ? Number(args[limitIdx + 1]) : Infinity,
    dryRun: args.includes('--dry-run'),
    force: args.includes('--force'),
  });
}
