// JSONファイルストア。DB未接続でも全データを data/*.json に保持し、
// 後から db/migrations のPostgres schemaへそのまま流し込める形を保つ。
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
export const DATA_DIR = join(ROOT, 'data');
export const REPORTS_DIR = join(ROOT, 'reports');
export const INBOX_DIR = join(ROOT, 'inbox');

export const TABLES = [
  'products', 'product_aliases', 'creators', 'creator_groups',
  'posts', 'mentions', 'collection_runs', 'gift_scores',
  'article_candidates', 'merge_candidates', 'crosspost_groups',
];

function fileFor(table) { return join(DATA_DIR, `${table}.json`); }

export function loadTable(table) {
  const f = fileFor(table);
  if (!existsSync(f)) return [];
  return JSON.parse(readFileSync(f, 'utf8'));
}

export function saveTable(table, rows) {
  mkdirSync(DATA_DIR, { recursive: true });
  writeFileSync(fileFor(table), JSON.stringify(rows, null, 2) + '\n', 'utf8');
}

export function loadDb() {
  const db = {};
  for (const t of TABLES) db[t] = loadTable(t);
  return db;
}

export function saveDb(db) {
  for (const t of TABLES) if (db[t]) saveTable(t, db[t]);
}

/** 連番ID発行: p_0001, po_0001 など。meta.jsonでカウンタ管理。 */
export function nextId(prefix) {
  const metaFile = join(DATA_DIR, 'meta.json');
  mkdirSync(DATA_DIR, { recursive: true });
  const meta = existsSync(metaFile) ? JSON.parse(readFileSync(metaFile, 'utf8')) : { counters: {} };
  meta.counters[prefix] = (meta.counters[prefix] || 0) + 1;
  writeFileSync(metaFile, JSON.stringify(meta, null, 2) + '\n', 'utf8');
  return `${prefix}_${String(meta.counters[prefix]).padStart(4, '0')}`;
}

export function nowIso() { return new Date().toISOString(); }
