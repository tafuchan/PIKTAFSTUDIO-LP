// 文字列正規化と類似度。Product Matching STEP 1 の基盤。
// Unicode NFKC → 小文字化 → 記号/空白整理 → カタカナ統一 → ブランド表記揺れ辞書

/** よく出るブランドの表記揺れ辞書（normalized表記 → canonical）。運用で追記する。 */
export const BRAND_SYNONYMS = {
  'シロ': 'shiro',
  'しろ': 'shiro',
  'ジョーマローン': 'jo malone london',
  'ジョーマローンロンドン': 'jo malone london',
  'jo malone': 'jo malone london',
  'イソップ': 'aesop',
  'サボン': 'sabon',
  'ロクシタン': "l'occitane",
  'loccitane': "l'occitane",
  'ディオール': 'dior',
  'クリスチャンディオール': 'dior',
  'イヴサンローラン': 'yves saint laurent',
  'イブサンローラン': 'yves saint laurent',
  'ysl': 'yves saint laurent',
  'ゲラン': 'guerlain',
  'シャネル': 'chanel',
  'ジルスチュアート': 'jill stuart',
  'ローラメルシエ': 'laura mercier',
  'フェルナンダ': 'fernanda',
  'スリー': 'three',
  'ナーズ': 'nars',
  'アディクション': 'addiction',
  'キールズ': "kiehl's",
  'kiehls': "kiehl's",
  'マリアージュフレール': 'mariage freres',
  'バーミキュラ': 'vermicular',
  'ブルーノ': 'bruno',
  'ルルルン': 'lululun',
  'ミルボン': 'milbon',
  'ウカ': 'uka',
  'オサジ': 'osaji',
  'ハッコー': 'hacci',
  'ハッチ': 'hacci',
  'スナイデル': 'snidel',
  'ジェラートピケ': 'gelato pique',
  'フランフラン': 'francfranc',
  'アフタヌーンティー': 'afternoon tea',
  'ポールアンドジョー': 'paul & joe',
  'ポール&ジョー': 'paul & joe',
  'メゾンマルジェラ': 'maison margiela',
  'マルジェラ': 'maison margiela',
  'ドットール ヴラニエス': "dr. vranjes",
  'ドットールヴラニエス': "dr. vranjes",
};

/** NFKC + 小文字 + 空白/記号の整理。日本語はそのまま残す。 */
export function normalizeText(s) {
  if (s == null) return '';
  let t = String(s).normalize('NFKC').toLowerCase();
  t = t.replace(/[　]/g, ' ');
  // 長音・中点・各種記号のゆらぎを整理（意味を持つ ' & . - は残す）
  t = t.replace(/[「」『』【】()（）\[\]{}<>《》"'’‘“”!！?？:：;；,、。・|/\\~〜*＊+＋=＝#＃%％]/g, ' ');
  t = t.replace(/\s+/g, ' ').trim();
  return t;
}

/** ひらがな→カタカナ（別名照合を強くする） */
export function hiraToKata(s) {
  return s.replace(/[ぁ-ゖ]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) + 0x60));
}

/** ブランド名を正規化し、シノニム辞書を適用する */
export function normalizeBrand(brand) {
  const n = normalizeText(brand);
  if (!n) return '';
  const nk = hiraToKata(n).replace(/ /g, '');
  for (const [k, v] of Object.entries(BRAND_SYNONYMS)) {
    const key = hiraToKata(normalizeText(k)).replace(/ /g, '');
    if (nk === key) return v;
  }
  return n;
}

/** 商品名を正規化（ブランド名が先頭に重複していれば除去） */
export function normalizeName(name, normalizedBrand = '') {
  let n = normalizeText(name);
  if (normalizedBrand && n.startsWith(normalizedBrand + ' ')) {
    n = n.slice(normalizedBrand.length + 1);
  }
  return n;
}

/** bigram Dice係数（0..1）。日本語/短文字列に頑健。 */
export function diceSimilarity(a, b) {
  a = normalizeText(a).replace(/ /g, '');
  b = normalizeText(b).replace(/ /g, '');
  if (!a || !b) return 0;
  if (a === b) return 1;
  if (a.length < 2 || b.length < 2) return a === b ? 1 : 0;
  const grams = (s) => {
    const m = new Map();
    for (let i = 0; i < s.length - 1; i++) {
      const g = s.slice(i, i + 2);
      m.set(g, (m.get(g) || 0) + 1);
    }
    return m;
  };
  const ga = grams(a), gb = grams(b);
  let inter = 0, total = 0;
  for (const [g, c] of ga) { total += c; inter += Math.min(c, gb.get(g) || 0); }
  for (const c of gb.values()) total += c;
  return (2 * inter) / total;
}

/** バリアント示唆語（Mergeしすぎ防止: §18） */
export const VARIANT_HINTS = [
  '限定', 'ミニ', 'セット', 'キット', 'リフィル', '詰め替え', 'l', 'm', 's',
  'ホリデー', 'クリスマス', '2025', '2026',
];

/** 2つの商品名がバリアント関係を示唆するか（香り/色/サイズ等の語が片方にだけある等） */
export function looksLikeVariantPair(nameA, nameB) {
  const a = normalizeText(nameA), b = normalizeText(nameB);
  const [shorter, longer] = a.length <= b.length ? [a, b] : [b, a];
  if (longer.includes(shorter) && longer !== shorter) return true;
  return false;
}
