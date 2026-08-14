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

/** Weergavenaam van een kanaal (Shopify-varianten → 'Shopify - D2C'), consistent met channels(). */
export function channelDisplay(ch: string): string {
  const key = normalizeChannel(ch);
  return key === 'shopify - d2c' ? 'Shopify - D2C' : (ch || '').trim();
}

/**
 * Verkoop-tak per land van een rij. Voor Media Markt de tak uit het winkel-label
 * ("Media Markt Belgium" / "Online Belgium" / "Media Markt Luxembourg" / "Media
 * Markt Netherlands" / "Online Netherlands"), met voorloopnummers gestript zodat
 * oud ("18 Media Markt Belgium") en nieuw ("Media Markt Belgium") samenvallen.
 * Oude NL-data zonder tak-prefix wordt afgeleid uit online-heuristiek + land.
 * Voor overige kanalen is het kanaal zelf de tak (FNAC, Shopify - D2C, Vanden
 * Borre, Brincr).
 */
export function branchOf(r: DataRow): string {
  const ch = channelDisplay(r.ch);
  if (!ch.startsWith('MM-')) return ch || r.ch || '—';
  const sl = (r.sl || '').trim();
  const slash = sl.indexOf(' / ');
  if (slash > 0) return sl.slice(0, slash).replace(/^\s*\d+\s+/, '').trim();
  const online = /online/i.test(sl);
  const country = r.ch === 'MM-BE' ? 'Belgium' : 'Netherlands';
  return `${online ? 'Online' : 'Media Markt'} ${country}`;
}

/** Maandag van een ISO-week "YYYYWW" (UTC): donderdag - 3 dagen. */
export function isoWeekMonday(week: string): Date | null {
  const t = isoWeekThursday(week);
  if (!t) return null;
  const mon = new Date(t);
  mon.setUTCDate(t.getUTCDate() - 3);
  return mon;
}

/** ISO-weken die in een maand ("YYYY-MM") vallen, oplopend gesorteerd. */
export function weeksInMonth(data: DataRow[], month: string): string[] {
  return [...new Set(data.filter((r) => weekToMonth(r.w) === month).map((r) => r.w).filter(isValidWeek))].sort();
}

/** Weken (uit de gegeven set) die het datumbereik [startISO, endISO] raken; lege grens = onbegrensd. */
export function weeksInRange(weeks: string[], startISO: string, endISO: string): string[] {
  const start = startISO ? new Date(`${startISO}T00:00:00Z`) : null;
  const end = endISO ? new Date(`${endISO}T23:59:59Z`) : null;
  return weeks
    .filter(isValidWeek)
    .filter((w) => {
      const mon = isoWeekMonday(w);
      if (!mon) return false;
      const sun = new Date(mon);
      sun.setUTCDate(mon.getUTCDate() + 6);
      if (start && sun < start) return false;
      if (end && mon > end) return false;
      return true;
    })
    .sort();
}

/** Datumbereik-label voor een set weken (ma van eerste week t/m zo van laatste), bijv. "1 - 28 jun 2026". */
export function weeksDateRangeLabel(weeks: string[]): string {
  const valid = weeks.filter(isValidWeek).sort();
  if (valid.length === 0) return '';
  const mon = isoWeekMonday(valid[0]);
  const lastMon = isoWeekMonday(valid[valid.length - 1]);
  if (!mon || !lastMon) return '';
  const sun = new Date(lastMon);
  sun.setUTCDate(lastMon.getUTCDate() + 6);
  const M = MONTH_NAMES_NL_SHORT;
  const dM = mon.getUTCDate(), mM = M[mon.getUTCMonth()], yM = mon.getUTCFullYear();
  const dS = sun.getUTCDate(), mS = M[sun.getUTCMonth()], yS = sun.getUTCFullYear();
  if (yM !== yS) return `${dM} ${mM} ${yM} - ${dS} ${mS} ${yS}`;
  if (mM !== mS) return `${dM} ${mM} - ${dS} ${mS} ${yM}`;
  return `${dM} - ${dS} ${mM} ${yM}`;
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

/**
 * Niet-nieuwe verkopen via Shopify tellen NIET mee in de sell-out. Herkent
 * 'Refurbished', 'Opened packaging' / 'Open box' in de productnaam en het
 * '-DAM'-suffix in de SKU (damaged/geopende verpakking), uitsluitend voor het
 * Shopify-kanaal (Media Markt e.d. refurbished blijft gewoon meetellen).
 * Zonder de open-box check telden bijv. 13x "Pure Air⁵ Opened packaging"
 * (SCPURZ040-00001-DAM) via de EAN-match mee als nieuwe "PURE Air5 Black",
 * terwijl Pure die zelf niet als sell-out rapporteert.
 * Wordt toegepast in allData(), zodat deze rijen nergens meegeteld worden.
 */
export function isShopifyRefurbished(r: DataRow): boolean {
  const ch = (r.ch || '').toLowerCase();
  if (!ch.startsWith('shopify')) return false;
  return /refurbished|opened packaging|open box/i.test(r.an || '') || /-DAM\b/i.test(r.sku || '');
}

/**
 * Losse onderdelen/accessoires (Pure spare-part SKU's beginnen met "PSPUR")
 * tellen niet mee als sell-out: Pure's eigen rapportage telt alleen steps.
 * Zonder dit filter kwamen na een Shopify-sync o.a. laders, banden en
 * reflectoren als "producten" in de SOA-telling terecht.
 */
export function isSparePart(r: DataRow): boolean {
  return /^PSPUR/i.test(r.sku || '');
}
