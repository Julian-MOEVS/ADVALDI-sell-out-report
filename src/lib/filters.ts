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

/* ── Maand-helpers (voor de "Per maand (SOA)"-weergave) ──
 * Rijen bewaren alleen de ISO-week ("YYYYWW"), niet de exacte verkoopdatum.
 * Een week wordt aan een maand toegewezen via zijn donderdag: de dag waar de
 * meeste van de 7 weekdagen (en dus de meeste verkopen) in vallen.
 */

/** Donderdag van een ISO-week "YYYYWW" (UTC). Null bij een ongeldige week. */
export function isoWeekThursday(week: string): Date | null {
  if (!isValidWeek(week)) return null;
  const year = parseInt(week.slice(0, 4));
  const wk = parseInt(week.slice(4, 6));
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const jan4Day = jan4.getUTCDay() || 7; // 1..7 (ma..zo)
  const mondayW1 = new Date(jan4);
  mondayW1.setUTCDate(jan4.getUTCDate() - (jan4Day - 1));
  const thursday = new Date(mondayW1);
  thursday.setUTCDate(mondayW1.getUTCDate() + (wk - 1) * 7 + 3);
  return thursday;
}

const monthKeyCache: Record<string, string> = {};

/** ISO-week "YYYYWW" → maandsleutel "YYYY-MM" op basis van de donderdag. */
export function weekToMonth(week: string): string {
  const cached = monthKeyCache[week];
  if (cached !== undefined) return cached;
  const t = isoWeekThursday(week);
  const key = t ? `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, '0')}` : week;
  monthKeyCache[week] = key;
  return key;
}

/** Unieke maanden in de data, oplopend gesorteerd ("YYYY-MM"). */
export function months(data: DataRow[]): string[] {
  return [...new Set(data.map((r) => r.w).filter(isValidWeek).map(weekToMonth))].sort();
}

/** Filter rijen op een maandsleutel ("YYYY-MM") en kanaal. */
export function filteredMonth(
  data: DataRow[],
  month: 'all' | string,
  channel: 'all' | string
): DataRow[] {
  const normCh = channel === 'all' ? null : normalizeChannel(channel);
  return data.filter(
    (r) =>
      (month === 'all' || weekToMonth(r.w) === month) &&
      (normCh === null || normalizeChannel(r.ch) === normCh)
  );
}

const MONTH_NAMES_NL = [
  'januari', 'februari', 'maart', 'april', 'mei', 'juni',
  'juli', 'augustus', 'september', 'oktober', 'november', 'december',
];
const MONTH_NAMES_NL_SHORT = [
  'jan', 'feb', 'mrt', 'apr', 'mei', 'jun',
  'jul', 'aug', 'sep', 'okt', 'nov', 'dec',
];

/** "2024-11" → "november 2024". */
export function monthLabel(month: string): string {
  const [y, m] = month.split('-').map(Number);
  if (!y || !m || m < 1 || m > 12) return month;
  return `${MONTH_NAMES_NL[m - 1]} ${y}`;
}

/** "2024-11" → "nov '24" (compact, voor de tabstrip). */
export function monthLabelShort(month: string): string {
  const [y, m] = month.split('-').map(Number);
  if (!y || !m || m < 1 || m > 12) return month;
  return `${MONTH_NAMES_NL_SHORT[m - 1]} '${String(y).slice(-2)}`;
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
