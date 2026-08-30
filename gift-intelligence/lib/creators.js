// Creator / Creator Group 処理（仕様 §9-10, §20）
// 同一人物のマルチ媒体アカウントを creator_group にまとめ、
// 「独立した発信者数」を水増ししないための基盤。
import { normalizeText, hiraToKata, diceSimilarity } from './normalize.js';

/** handle正規化: @除去・小文字・記号除去 */
export function normalizeHandle(handle) {
  return normalizeText(String(handle || '').replace(/^@/, '')).replace(/[._\- ]/g, '');
}

/** 表示名正規化（絵文字・肩書き除去のうえカタカナ統一） */
export function normalizeDisplayName(name) {
  let n = normalizeText(name);
  n = n.replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}]/gu, '');
  n = n.split(/[@｜|/]/)[0]; // 「カリン@限界OL」→「カリン」
  return hiraToKata(n).replace(/ /g, '');
}

/**
 * creatorを既存に照合。platform+handle一致なら同一アカウント。
 * @returns {{creator?:object, isNew:boolean}}
 */
export function findCreator(platform, handle, creators) {
  const nh = normalizeHandle(handle);
  const c = creators.find((x) => x.platform === platform && normalizeHandle(x.handle) === nh);
  return { creator: c, isNew: !c };
}

/**
 * 別platformの既存creatorと同一人物か推定して group を提案する。
 * 根拠: handleの類似（完全一致 or 片方が他方を包含）または表示名の高類似。
 * 自動groupingは保守的に。曖昧なものは merge_candidates(kind=creator) へ。
 * @returns {{groupOf?:object, review?:object}}
 */
export function suggestCreatorGroup(newCreator, creators) {
  const nh = normalizeHandle(newCreator.handle);
  const nd = normalizeDisplayName(newCreator.display_name || '');
  for (const c of creators) {
    if (c.platform === newCreator.platform) continue;
    const ch = normalizeHandle(c.handle);
    const cd = normalizeDisplayName(c.display_name || '');
    const handleMatch = nh && ch && (nh === ch || (nh.length >= 5 && (nh.includes(ch) || ch.includes(nh))));
    const nameSim = nd && cd ? diceSimilarity(nd, cd) : 0;
    if (handleMatch && (nameSim >= 0.5 || !nd || !cd)) return { groupOf: c };
    if (handleMatch || nameSim >= 0.85) return { review: c };
  }
  return {};
}

/** Watchlist評価（§20）: 手動入力の観点を0-100に集約するヘルパ */
export function creatorQualityScore({ giftRatio = 0, specificity = 0, freshness = 0, engagement = 0, notAdHeavy = 1 }) {
  // 各0..1で渡す。広告過多なら notAdHeavy=0.3等に下げる。
  const s = (giftRatio * 0.3 + specificity * 0.3 + freshness * 0.2 + engagement * 0.2) * notAdHeavy;
  return Math.round(Math.min(1, s) * 100);
}
