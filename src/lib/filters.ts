import type { DataRow } from '../types';
import { matchToCatalog, catalogDisplayName } from './catalog';

export function filtered(
  data: DataRow[],
  week: 'all' | string,
  channel: 'all' | string
): DataRow[] {
  return data.filter(
    (r) =>
      (week === 'all' || r.w === week) &&
      (channel === 'all' || r.ch === channel)
  );
}

export function channels(data: DataRow[]): string[] {
  return [...new Set(data.map((r) => r.ch).filter(Boolean))].sort();
}

export function weeks(data: DataRow[]): string[] {
  return [...new Set(data.map((r) => r.w))].sort();
}

export function sum(rows: DataRow[], key: 's' | 'p' | 'k'): number {
  return rows.reduce((a, r) => a + r[key], 0);
}

export function stockForData(rows: DataRow[], selectedWeek: 'all' | string): number {
  if (selectedWeek !== 'all') return rows.reduce((s, r) => s + r.k, 0);
  const wks = [...new Set(rows.map((r) => r.w))].sort();
  const last = wks[wks.length - 1];
  return last ? rows.filter((r) => r.w === last).reduce((s, r) => s + r.k, 0) : 0;
}

export function stockForArticle(rows: DataRow[]): number {
  const wks = [...new Set(rows.map((r) => r.w))].sort();
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
const GROUPED_CHANNELS = ['shopify'];

export function resolveStoreKey(r: DataRow): string {
  if (r.ch && GROUPED_CHANNELS.includes(r.ch.toLowerCase())) return r.ch;
  // For Brincr, show channel + store name
  if (r.ch && r.ch.toLowerCase() === 'brincr' && r.st) {
    return `Brincr / ${r.st}`;
  }
  return r.sl || r.st;
}
