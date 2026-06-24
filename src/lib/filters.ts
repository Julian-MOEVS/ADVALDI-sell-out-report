import type { DataRow } from '../types';
import { matchToCatalog, catalogDisplayName } from './catalog';

/** Normaliseer kanaal-string voor vergelijking: trim, lowercase, varianten van 'Shopify' samen. */
function normalizeChannel(ch: string): string {
  const v = (ch || '').trim().toLowerCase();
  if (v.startsWith('shopify')) return 'shopify - d2c';
  return v;
}

export function filtered(
  data: DataRow[],
  week: 'all' | string,
  channel: 'all' | string
): DataRow[] {
  const normCh = channel === 'all' ? null : normalizeChannel(channel);
  return data.filter(
    (r) =>
      (week === 'all' || r.w === week) &&
      (normCh === null || normalizeChannel(r.ch) === normCh)
  );
}

/** Geldige ISO-week (YYYYWW). 'onbekend' en 'NaNNaN' worden afgewezen om sort-corruptie te voorkomen. */
function isValidWeek(w: string): boolean {
  return /^\d{6}$/.test(w);
}

export function channels(data: DataRow[]): string[] {
  // Dedup case-insensitief: oude 'Shopify' en nieuwe 'Shopify - D2C' tonen als één pill.
  const seen = new Map<string, string>();
  for (const r of data) {
    if (!r.ch) continue;
    const key = normalizeChannel(r.ch);
    // Bewaar de meest expliciete weergavenaam (D2C variant heeft voorrang)
    const display = key === 'shopify - d2c' ? 'Shopify - D2C' : r.ch.trim();
    if (!seen.has(key)) seen.set(key, display);
  }
  return [...seen.values()].sort();
}

export function weeks(data: DataRow[]): string[] {
  return [...new Set(data.map((r) => r.w).filter(isValidWeek))].sort();
}

export function sum(rows: DataRow[], key: 's' | 'p' | 'k'): number {
  return rows.reduce((a, r) => a + r[key], 0);
}

export function stockForData(rows: DataRow[], selectedWeek: 'all' | string): number {
  if (selectedWeek !== 'all') return rows.reduce((s, r) => s + r.k, 0);
  const wks = [...new Set(rows.map((r) => r.w).filter(isValidWeek))].sort();
  const last = wks[wks.length - 1];
  return last ? rows.filter((r) => r.w === last).reduce((s, r) => s + r.k, 0) : 0;
}

export function stockForArticle(rows: DataRow[]): number {
  const wks = [...new Set(rows.map((r) => r.w).filter(isValidWeek))].sort();
  const last = wks[wks.length - 1];
  return last ? rows.filter((r) => r.w === last).reduce((s, r) => s + r.k, 0) : 0;
}

export function groupBy<T>(arr: T[], keyFn: (item: T) => string): Record<string, T[]> {
  const result: Record<string, T[]> = {};
  for (const item of arr) {
    const key = keyFn(item);
    if (!result[key]) result[key] = [];
    result[key].push(item);
  }
  return result;
}

/**
 * Resolve a DataRow to its product key (catalog SKU or original article name).
 * Use this to group sell-out data by resolved product.
 */
export function resolveProductKey(r: DataRow): string {
  return matchToCatalog(r.an, r.ean, r.sku) || r.an;
}

/**
 * Get the display name for a resolved product key.
 */
export function resolvedDisplayName(key: string, aliases: Record<string, string>): string {
  if (aliases[key]) return aliases[key];
  const catName = catalogDisplayName(key);
  if (catName) return catName;
  return key;
}

/**
 * Resolve a store name.
 * - Shopify: grouped as "Shopify" (all orders combined)
 * - Brincr: per partner/store (e.g. "Brincr / MOEVS Eindhoven")
 * - Media Markt / FNAC / VDB: per store
 */
export function resolveStoreKey(r: DataRow): string {
  const ch = (r.ch || '').toLowerCase().trim();
  // Shopify-varianten ('Shopify', 'Shopify - D2C') worden gegroepeerd onder één canonieke storenaam.
  if (ch.startsWith('shopify')) return 'Shopify - D2C';
  if (ch === 'brincr' && r.st) return `Brincr / ${r.st}`;
  return r.sl || r.st || r.ch || '—';
}
