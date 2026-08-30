// enrich-images のマッチング部分（API非依存）のテスト
import test from 'node:test';
import assert from 'node:assert/strict';

// pickBest等は非公開のため、同じロジックの入口 enrichAll はAPIキー必須。
// ここでは coverage/brand 判定の性質を、実際の楽天タイトル形式で検証する。
import { normalizeText } from '../lib/normalize.js';

function cleanTitle(t) {
  return String(t)
    .replace(/【[^】]*】|［[^］]*］|《[^》]*》|＼[^／]*／|\[[^\]]*\]|（[^）]*）|\([^)]*\)/g, ' ')
    .replace(/送料無料|あす楽|ポイント\d*倍|公式|正規品|ラッピング無料|ギフト対応|翌日配送/g, ' ');
}
function coverage(ourName, itemTitle) {
  const a = normalizeText(ourName).replace(/ /g, '');
  const b = normalizeText(cleanTitle(itemTitle)).replace(/ /g, '');
  if (a.length < 2 || !b) return 0;
  let hit = 0, total = 0;
  for (let i = 0; i < a.length - 1; i++) { total++; if (b.includes(a.slice(i, i + 2))) hit++; }
  return total ? hit / total : 0;
}

test('coverage: 楽天の長い販促タイトルでも正しい商品なら高カバレッジ', () => {
  const c = coverage(
    'ミス ディオール ハンド クリーム',
    '【国内正規品】Dior ディオール ミス ディオール ハンド クリーム 50mL ギフト プレゼント 誕生日 送料無料'
  );
  assert.ok(c >= 0.7, `coverage=${c}`);
});

test('coverage: 別商品（同ブランド）は閾値未満', () => {
  const c = coverage(
    'ミス ディオール ハンド クリーム',
    'Dior ディオール アディクト リップ マキシマイザー 6mL 正規品'
  );
  assert.ok(c < 0.7, `coverage=${c}`);
});

test('coverage: 販促括弧が除去されて誤ヒットしない', () => {
  const c = coverage('SHIRO サボン ハンド美容液', '【ギフトにおすすめ！サボンの香り】無関係な雑貨');
  assert.ok(c < 0.85, `coverage=${c}`);
});
