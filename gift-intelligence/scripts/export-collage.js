// コラージュ/アイデアリストの「設計図」をDBから生成する。
//   node scripts/export-collage.js               # 記事候補TOP5ぶん
//   node scripts/export-collage.js --context "女友達|誕生日|3000-5000"
//   node scripts/export-collage.js --top 8       # 生成数を変える
//
// 出力: reports/collage/<context>.md
// 用途: Amazonアソシエイトの「コラージュ」「アイデアリスト」をブラウザで作成する
// ときの手元資料。作成手順は docs/collage-playbook.md（Claude/Codexの代行操作用）。
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { loadDb, REPORTS_DIR, nowIso } from '../lib/store.js';
import { searchName } from './enrich-images.js';
import { pathToFileURL } from 'node:url';

export function exportCollage({ contextKey = null, top = 5, maxProducts = 6 } = {}) {
  const db = loadDb();
  const outDir = join(REPORTS_DIR, 'collage');
  mkdirSync(outDir, { recursive: true });
  const candidates = contextKey
    ? db.article_candidates.filter((c) => c.context_key === contextKey)
    : db.article_candidates.slice(0, top);
  const files = [];
  for (const c of candidates) {
    const scores = db.gift_scores
      .filter((s) => s.context_key === c.context_key)
      .sort((a, b) => b.gift_score - a.gift_score);
    const lines = [];
    const [recipient, occasion, budget] = c.context_key.split('|');
    lines.push(`# コラージュ設計図: ${c.context_key}`);
    lines.push(`生成: ${nowIso()} / Article Score ${c.article_score}`);
    lines.push('');
    lines.push(`## 見出しテキスト案（コラージュのヘッダに使う）`);
    lines.push(`- ${c.suggested_title}`);
    if (budget !== 'all') lines.push(`- 予算${budget.replace('-', '〜')}円でハズさない${recipient !== 'all' ? recipient + 'ギフト' : 'ギフト'}`);
    if (occasion !== 'all') lines.push(`- ${occasion}に本当に喜ばれたものだけ集めました`);
    lines.push('');
    lines.push(`## 掲載商品（GiftScore順・コラージュは4〜6点が見やすい）`);
    lines.push(`| # | 商品 | コラージュ内検索キーワード | 独立推薦 | 楽天画像 | 参考価格 |`);
    lines.push(`|---|---|---|---|---|---|`);
    let rank = 0;
    for (const s of scores) {
      const p = db.products.find((x) => x.id === s.product_id);
      if (!p) continue;
      // ノーブランド汎用名はコラージュ検索で無関係商品が出るため外す
      if (!p.canonical_brand && (p.canonical_name || '').length < 6) continue;
      rank++;
      if (rank > maxProducts) break;
      const kw = searchName([p.canonical_brand, p.canonical_name].filter(Boolean).join(' '));
      const img = p.metadata?.rakuten?.image_url ? '有' : '無';
      const price = p.metadata?.rakuten?.item_price ? `約${p.metadata.rakuten.item_price.toLocaleString('ja-JP')}円` : (p.price_min_jpy ? `${p.price_min_jpy.toLocaleString('ja-JP')}円〜` : '—');
      lines.push(`| ${rank} | ${p.canonical_brand ?? ''} ${p.canonical_name} | \`${kw}\` | ${s.crosspost_adjusted_count}源 | ${img} | ${price} |`);
    }
    lines.push('');
    lines.push(`## メモ`);
    lines.push(`- コラージュの商品検索ボックスに「コラージュ内検索キーワード」を貼って商品を探す。見つからない場合はブランド名だけで再検索`);
    lines.push(`- Amazonに出品がない商品（D2C等）は飛ばして次点を使う`);
    lines.push(`- 公開は必ず人間が確認してから（下書き保存まででOK）`);
    const file = join(outDir, `${c.context_key.replace(/[|/\\:*?"<>]/g, '_')}.md`);
    writeFileSync(file, lines.join('\n') + '\n', 'utf8');
    files.push(file);
  }
  for (const f of files) console.log(f);
  return files;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2);
  const ci = args.indexOf('--context');
  const ti = args.indexOf('--top');
  exportCollage({
    contextKey: ci >= 0 ? args[ci + 1] : null,
    top: ti >= 0 ? Number(args[ti + 1]) : 5,
  });
}
