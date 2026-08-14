import * as XLSX from 'xlsx';
import type { DataRow } from '../types';
import type { CatalogEntry } from './supabase';
import { stockForArticle, resolveProductKey, resolvedDisplayName, branchOf } from './filters';
import { matchToCatalog, getCatalogBySku, getDynamicCatalog } from './catalog';

interface ColMap {
  week: number;
  manufacturer: number;
  productGroup: number;
  articleName: number;
  ean: number;
  salesChannel: number;
  store: number;
  purchase: number;
  sales: number;
  stock: number;
}

function normalizeHeader(h: string): string {
  return h.trim().replace(/[\r\n]+/g, ' ');
}

function cleanNum(v: unknown): number {
  if (v === null || v === undefined || v === '') return 0;
  const n = Number(v);
  return isNaN(n) ? 0 : n;
}

function cleanStr(v: unknown): string {
  if (v === null || v === undefined) return '';
  return String(v).replace(/\.0$/, '').trim();
}

const BRAND_MAP: Record<string, string> = {
  'pure': 'Pure Electric',
  'purel': 'Pure Electric',
  'pure electric': 'Pure Electric',
};

function normalizeBrand(raw: string): string {
  return BRAND_MAP[raw.toLowerCase()] ?? raw;
}

function detectMarket(headers: string[], fileName: string): 'NL' | 'BE' {
  const hasSalesChannel = headers.some(
    (h) => normalizeHeader(h).toLowerCase() === 'sales channel'
  );
  if (hasSalesChannel) return 'BE';
  if (fileName.includes('Sales_and_Stock_Report_Week')) return 'BE';
  return 'NL';
}

function findCol(headers: string[], ...names: string[]): number {
  for (const name of names) {
    const idx = headers.findIndex(
      (h) => normalizeHeader(h).toLowerCase() === name.toLowerCase()
    );
    if (idx >= 0) return idx;
  }
  return -1;
}

export function parseExcelFile(file: File): Promise<{ rows: DataRow[]; market: 'NL' | 'BE' }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target!.result as ArrayBuffer);
        const wb = XLSX.read(data, { type: 'array' });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const raw: string[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });

        if (raw.length < 2) {
          resolve({ rows: [], market: 'NL' });
          return;
        }

        const headers = raw[0].map(String);
        const market = detectMarket(headers, file.name);

        const colMap: ColMap = {
          week: findCol(headers, 'Week'),
          manufacturer: findCol(headers, 'Manufacturer'),
          productGroup: findCol(headers, 'Product group', 'Productgroup'),
          articleName: findCol(headers, 'Article name', 'Articlename'),
          ean: findCol(headers, 'EAN'),
          salesChannel: findCol(headers, 'Sales channel', 'Saleschannel'),
          store: findCol(headers, 'Store'),
          purchase: findCol(headers, 'Purchase', 'Purchases'),
          sales: findCol(headers, 'Sales'),
          stock: findCol(headers, 'Stock'),
        };

        const rows: DataRow[] = [];
        for (let i = 1; i < raw.length; i++) {
          const r = raw[i];
          if (!r || r.length === 0) continue;

          const w = cleanStr(r[colMap.week]);
          if (!w) continue;

          const rawCh = colMap.salesChannel >= 0 ? cleanStr(r[colMap.salesChannel]) : '';
          const ch = market === 'BE' ? 'MM-BE' : 'MM-NL';
          const st = cleanStr(r[colMap.store]);
          const sl = rawCh ? `${rawCh} / ${st}` : st;

          rows.push({
            w,
            rg: market,
            mfr: normalizeBrand(cleanStr(r[colMap.manufacturer])),
            pg: cleanStr(r[colMap.productGroup]),
            an: cleanStr(r[colMap.articleName]),
            ean: cleanStr(r[colMap.ean]),
            sku: '',
            ch,
            st,
            sl,
            p: cleanNum(r[colMap.purchase]),
            s: cleanNum(r[colMap.sales]),
            k: cleanNum(r[colMap.stock]),
          });
        }

        resolve({ rows, market });
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = () => reject(new Error('Bestand kon niet worden gelezen'));
    reader.readAsArrayBuffer(file);
  });
}

/* ── Media Markt CSV parser (nieuwe puntkomma-gescheiden export, per land) ── */

function parseSemicolonLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') inQuotes = !inQuotes;
    else if (ch === ';' && !inQuotes) { result.push(current); current = ''; }
    else current += ch;
  }
  result.push(current);
  return result;
}

/** Markt uit de "Sales channel"-waarde ("15 Media Markt Netherlands", "50 Online Belgium", "37 Media Markt Luxembourg"). LU valt onder BE. */
function mmMarketFromSalesChannel(sc: string): 'NL' | 'BE' | null {
  const v = sc.toLowerCase();
  if (v.includes('netherlands') || v.includes('nederland')) return 'NL';
  if (v.includes('belgium') || v.includes('belgi') || v.includes('luxembourg') || v.includes('luxemburg')) return 'BE';
  return null;
}

/** Fallback: markt uit de bestandsnaam (NL_… → NL, BE_…/LU_… → BE). */
function mmMarketFromFilename(name: string): 'NL' | 'BE' {
  const v = name.toUpperCase();
  if (v.startsWith('BE') || v.startsWith('LU') || v.includes('_BE_') || v.includes('_LU_')) return 'BE';
  return 'NL';
}

/**
 * Nieuwe Media Markt CSV (puntkomma-gescheiden, per land NL/BE/LU). Kopregel:
 * Week;Manufacturer;Department id;Department name;Product group id;Product group name;
 * Article number;Article name;EAN;Sales channel;Store code;Store name;Supplier number;
 * Supplier name;purchase;sales;stock
 *
 * Luxemburg valt onder markt BE (BE/LU). Kanaal wordt MM-NL / MM-BE, net als bij de
 * oude Media Markt-xlsx, zodat de data samenvalt met bestaande MM-cijfers. Het Media
 * Markt-artikelnummer wordt als `sku` bewaard (zoals de FNAC/VDB-CSV de VDB-code);
 * EAN blijft de primaire catalogus-match.
 */
export function parseMediaMarktCsvText(
  text: string,
  fileName: string
): { rows: DataRow[]; market: 'NL' | 'BE' } {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 2) return { rows: [], market: mmMarketFromFilename(fileName) };

  const headers = parseSemicolonLine(lines[0]);
  const col = {
    week: findCol(headers, 'Week'),
    manufacturer: findCol(headers, 'Manufacturer'),
    productGroup: findCol(headers, 'Product group name', 'Product group', 'Productgroup'),
    articleNumber: findCol(headers, 'Article number', 'Articlenumber'),
    articleName: findCol(headers, 'Article name', 'Articlename'),
    ean: findCol(headers, 'EAN'),
    salesChannel: findCol(headers, 'Sales channel', 'Saleschannel'),
    storeName: findCol(headers, 'Store name', 'Storename'),
    purchase: findCol(headers, 'purchase', 'Purchase', 'Purchases'),
    sales: findCol(headers, 'sales', 'Sales'),
    stock: findCol(headers, 'stock', 'Stock'),
  };

  // Zonder Week- of Article name-kolom is dit geen geldig MM-CSV.
  if (col.week < 0 || col.articleName < 0) {
    return { rows: [], market: mmMarketFromFilename(fileName) };
  }

  let fileMarket: 'NL' | 'BE' = mmMarketFromFilename(fileName);
  const rows: DataRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const r = parseSemicolonLine(lines[i]);
    if (r.length < 3) continue;

    const w = cleanStr(r[col.week]);
    if (!w) continue;

    const sc = col.salesChannel >= 0 ? cleanStr(r[col.salesChannel]) : '';
    const market = mmMarketFromSalesChannel(sc) ?? mmMarketFromFilename(fileName);
    fileMarket = market;
    const store = col.storeName >= 0 ? cleanStr(r[col.storeName]) : '';
    // "15 Media Markt Netherlands" → "Media Markt Netherlands" (nummer-prefix eraf).
    const branch = sc.replace(/^\s*\d+\s+/, '').trim();
    // Winkel-label = "tak / winkel" (bijv. "Media Markt Netherlands / Mediamarkt
    // Den Bosch") zodat de specifieke winkel benoemd wordt en niet alleen de tak;
    // online blijft zo ook los van de fysieke winkels.
    const storeLabel = store ? (branch ? `${branch} / ${store}` : store) : branch;

    rows.push({
      w,
      rg: market,
      mfr: normalizeBrand(cleanStr(r[col.manufacturer])),
      pg: col.productGroup >= 0 ? cleanStr(r[col.productGroup]) : '',
      an: cleanStr(r[col.articleName]),
      ean: col.ean >= 0 ? cleanStr(r[col.ean]) : '',
      sku: col.articleNumber >= 0 ? cleanStr(r[col.articleNumber]) : '',
      ch: market === 'BE' ? 'MM-BE' : 'MM-NL',
      st: store,
      sl: storeLabel,
      p: cleanNum(r[col.purchase]),
      s: cleanNum(r[col.sales]),
      k: cleanNum(r[col.stock]),
    });
  }

  return { rows, market: fileMarket };
}

export function parseMediaMarktCsv(file: File): Promise<{ rows: DataRow[]; market: 'NL' | 'BE' }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        resolve(parseMediaMarktCsvText(e.target!.result as string, file.name));
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = () => reject(new Error('Bestand kon niet worden gelezen'));
    reader.readAsText(file);
  });
}

/** Returns Sunday (end of ISO week) for a week string like "202446". */
function isoWeekEnd(week: string): Date | null {
  if (!/^\d{6}$/.test(week)) return null;
  const year = parseInt(week.slice(0, 4));
  const wk = parseInt(week.slice(4, 6));
  // ISO week 1 contains Jan 4. Compute Monday of week 1, then add (wk-1)*7 + 6 days for Sunday.
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const jan4Day = jan4.getUTCDay() || 7; // 1..7
  const mondayW1 = new Date(jan4);
  mondayW1.setUTCDate(jan4.getUTCDate() - (jan4Day - 1));
  const sunday = new Date(mondayW1);
  sunday.setUTCDate(mondayW1.getUTCDate() + (wk - 1) * 7 + 6);
  return sunday;
}

/** JS Date → Excel date serial (1900 epoch, with leap-year bug). */
function toExcelSerial(d: Date): number {
  const epoch = Date.UTC(1899, 11, 30); // 1899-12-30
  return Math.floor((d.getTime() - epoch) / 86400000);
}

type RefChannel = 'Big Box' | 'Independent ' | 'Online' | 'B2B' | 'D2C - Pure';
type SellOutKind = 'total' | 'online' | 'instore';

/** Derive retailer name, channel, country and sell-out split for the Pure template. */
function retailerAndChannel(r: DataRow): {
  retailer: string;
  channel: RefChannel;
  country: string;
  kind: SellOutKind;
} {
  const ch = r.ch || '';
  const country = countryFromMarket(r.rg);

  if (ch === 'MM-NL') return { retailer: 'MediaMarkt Netherlands', channel: 'Big Box', country: 'Netherlands', kind: 'total' };
  if (ch === 'MM-BE') return { retailer: 'MediaMarkt Belgium', channel: 'Big Box', country: 'Belgium', kind: 'total' };
  if (ch === 'Vanden Borre') return { retailer: 'Vanden Borre', channel: 'Big Box', country: 'Belgium', kind: 'total' };
  if (ch === 'FNAC') return { retailer: 'FNAC', channel: 'Big Box', country: 'Belgium', kind: 'total' };
  if (ch === 'Shopify' || ch === 'Shopify - D2C') return { retailer: 'Shopify - D2C', channel: 'D2C - Pure', country, kind: 'online' };
  if (ch === 'Brincr') return { retailer: r.st || 'Independent', channel: 'Independent ', country, kind: 'instore' };
  return { retailer: ch || r.st || '—', channel: 'Online', country, kind: 'total' };
}

/** Sanitize a string so it can be used as an Excel sheet name. */
function sheetSafeName(name: string, used: Set<string>): string {
  let s = name.replace(/[\\/?*[\]:]/g, '-').trim();
  if (s.length > 31) s = s.slice(0, 31);
  if (!s) s = 'Sheet';
  let candidate = s;
  let i = 2;
  while (used.has(candidate.toLowerCase())) {
    const suffix = ` (${i++})`;
    candidate = s.slice(0, 31 - suffix.length) + suffix;
  }
  used.add(candidate.toLowerCase());
  return candidate;
}

function countryFromMarket(rg: 'NL' | 'BE'): string {
  return rg === 'BE' ? 'Belgium' : 'Netherlands';
}

/** Build a SELL-OUT-format sheet (Pure x ADVALDI layout) for a subset of rows. */
function buildSellOutSheet(
  rows: DataRow[],
  weekEndSerial: number | '',
  aliases: Record<string, string>
): { sheet: XLSX.WorkSheet; rowCount: number } {
  const groups: Record<string, { rows: DataRow[]; meta: ReturnType<typeof retailerAndChannel> }> = {};
  for (const r of rows) {
    const meta = retailerAndChannel(r);
    const productKey = resolveProductKey(r);
    const key = `${meta.country}||${productKey}||${meta.retailer}||${meta.channel}`;
    if (!groups[key]) groups[key] = { rows: [], meta };
    groups[key].rows.push(r);
  }

  const TITLE_ROW: (string | number)[] = [
    '', '', 'Sell Out Reporting', '', '', '', '', '', '', '', '',
    'If online/instore sales split not possible, please complete Total Week', '',
  ];
  const GROUP_ROW: (string | number)[] = [
    '', '', '', '', '', '', '', 'Sell Out', '', '', '', '', '',
  ];
  const HEADER_ROW: (string | number)[] = [
    '',
    'Country', 'Distributor', 'Product', 'Retailer Name', 'Channel', 'Week Ending',
    'Week Sell Out Online',
    'Week Sell Out\r\nIn Store',
    'Total Week Retailer Sell Out',
    'Total Week Sell In\r\n(Distie to Retailer)',
    'Total Returns',
    'Total Retailer Inventory',
  ];

  const data: (string | number)[][] = [
    TITLE_ROW,
    ['', '', '', '', '', '', '', '', '', '', '', '', ''],
    GROUP_ROW,
    HEADER_ROW,
  ];

  const retailerRank = (r: string): number => {
    if (r === 'Vanden Borre') return 0;
    if (r === 'FNAC') return 1;
    if (r === 'MediaMarkt Netherlands') return 2;
    if (r === 'MediaMarkt Luxembourg') return 3;
    if (r === 'MediaMarkt Belgium') return 4;
    if (r === 'Shopify - D2C' || r === 'Shopify') return 5;
    return 6;
  };

  const sortedKeys = Object.keys(groups).sort((a, b) => {
    const ma = groups[a].meta;
    const mb = groups[b].meta;
    const ra = retailerRank(ma.retailer);
    const rb = retailerRank(mb.retailer);
    if (ra !== rb) return ra - rb;
    if (ma.retailer !== mb.retailer) return ma.retailer.localeCompare(mb.retailer);
    return a.localeCompare(b);
  });

  for (const key of sortedKeys) {
    const [, productKey] = key.split('||');
    const { rows: grp, meta } = groups[key];
    const s = grp.reduce((a, r) => a + r.s, 0);
    const p = grp.reduce((a, r) => a + r.p, 0);
    const k = stockForArticle(grp);
    const name = resolvedDisplayName(productKey, aliases);

    const online  = meta.kind === 'online'  ? s : '';
    const inStore = meta.kind === 'instore' ? s : '';

    data.push([
      '',
      meta.country,
      'ADVALDI',
      name,
      meta.retailer,
      meta.channel,
      weekEndSerial,
      online,
      inStore,
      s,
      p || '',
      '',
      k || '',
    ]);
  }

  const ws = XLSX.utils.aoa_to_sheet(data);

  for (let r = 4; r < data.length; r++) {
    const cellRef = XLSX.utils.encode_cell({ r, c: 6 });
    const cell = ws[cellRef];
    if (cell && typeof cell.v === 'number') {
      cell.t = 'n';
      cell.z = 'm/d/yyyy';
    }
  }

  for (let c = 0; c < HEADER_ROW.length; c++) {
    const cellRef = XLSX.utils.encode_cell({ r: 3, c });
    const cell = ws[cellRef];
    if (cell) {
      cell.s = { ...(cell.s || {}), alignment: { wrapText: true, vertical: 'center' } };
    }
  }

  autoWidth(ws, data);
  return { sheet: ws, rowCount: data.length - 4 };
}

export function exportWeekExcel(
  week: string,
  _market: string,
  rows: DataRow[],
  _prevRows: DataRow[],
  aliases: Record<string, string>
): void {
  const weekEnd = isoWeekEnd(week);
  const weekEndSerial = weekEnd ? toExcelSerial(weekEnd) : '';

  // Group rows per brand; each brand becomes its own tab in Pure x ADVALDI format.
  const byBrand: Record<string, DataRow[]> = {};
  for (const r of rows) {
    const brand = r.mfr || 'Onbekend merk';
    (byBrand[brand] ||= []).push(r);
  }

  const brandsByVolume = Object.entries(byBrand)
    .map(([brand, brandRows]) => ({
      brand,
      brandRows,
      sales: brandRows.reduce((a, r) => a + r.s, 0),
    }))
    .sort((a, b) => b.sales - a.sales);

  const wb = XLSX.utils.book_new();
  const usedSheetNames = new Set<string>();

  if (brandsByVolume.length === 0) {
    // Fallback: empty template so the file is still valid.
    const { sheet } = buildSellOutSheet([], weekEndSerial, aliases);
    XLSX.utils.book_append_sheet(wb, sheet, sheetSafeName('SELL OUT', usedSheetNames));
  } else {
    for (const { brand, brandRows } of brandsByVolume) {
      const { sheet } = buildSellOutSheet(brandRows, weekEndSerial, aliases);
      XLSX.utils.book_append_sheet(wb, sheet, sheetSafeName(brand, usedSheetNames));
    }
  }

  XLSX.writeFile(wb, `Sell Out Report Pure x ADVALDI (${formatExportDate()}).xlsx`);
}

function formatExportDate(): string {
  const d = new Date();
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = d.getFullYear();
  return `${dd}-${mm}-${yyyy}`;
}


/**
 * Kept for backwards compatibility: both export buttons now produce the same
 * Pure x ADVALDI file (één tab per merk in sell-out format).
 */
export function exportBrandExcel(
  week: string,
  market: string,
  rows: DataRow[],
  aliases: Record<string, string>
): void {
  exportWeekExcel(week, market, rows, [], aliases);
}

/**
 * SOA maand-totaaloverzicht: één tabblad per merk, met per product een kolom per
 * kanaal (MM-NL, MM-BE, FNAC, Shopify - D2C, Vanden Borre, ...) plus een Totaal-
 * en Voorraad-kolom en een TOTAAL-regel. `rows` is al gefilterd op de gekozen
 * maand + de aangevinkte kanalen; `periodLabel` is het datumbereik van de volle
 * weken (bijv. "1 - 28 jun 2026"); `month` is een maandsleutel "YYYY-MM".
 */
export function exportMonthTotalExcel(
  periodLabel: string,
  channelLabel: string,
  rows: DataRow[],
  aliases: Record<string, string>
): void {
  // Kolommen = verkoop-takken per land (Media Markt NL, Online NL, Media Markt BE,
  // Online BE, Media Markt LU, FNAC, Shopify - D2C, ...), op omzet gesorteerd.
  const chTotals: Record<string, number> = {};
  for (const r of rows) {
    const tak = branchOf(r) || '—';
    chTotals[tak] = (chTotals[tak] || 0) + r.s;
  }
  const channelCols = Object.keys(chTotals).sort((a, b) => (chTotals[b] - chTotals[a]) || a.localeCompare(b));

  // Groepeer rijen per merk (case/whitespace-insensitief, meest-voorkomende casing).
  const brandBuckets: Record<string, { labelCounts: Record<string, number>; rows: DataRow[] }> = {};
  for (const r of rows) {
    const key = (r.mfr || '').trim().toLowerCase() || 'onbekend merk';
    const bucket = (brandBuckets[key] ||= { labelCounts: {}, rows: [] });
    const label = (r.mfr || '').trim() || 'Onbekend merk';
    bucket.labelCounts[label] = (bucket.labelCounts[label] || 0) + 1;
    bucket.rows.push(r);
  }

  interface Item { name: string; perCh: Record<string, number>; sold: number; stock: number }
  const brands = Object.values(brandBuckets)
    .map((bucket) => {
      const brand = Object.entries(bucket.labelCounts).sort((a, b) => b[1] - a[1])[0][0];
      const products: Record<string, DataRow[]> = {};
      for (const r of bucket.rows) (products[resolveProductKey(r)] ||= []).push(r);
      const items: Item[] = Object.entries(products)
        .map(([pk, grp]) => {
          const perCh: Record<string, number> = {};
          for (const r of grp) {
            const c = branchOf(r) || '—';
            perCh[c] = (perCh[c] || 0) + r.s;
          }
          return { name: resolvedDisplayName(pk, aliases), perCh, sold: grp.reduce((a, r) => a + r.s, 0), stock: stockForArticle(grp) };
        })
        .filter((p) => p.sold !== 0 || p.stock > 0)
        .sort((a, b) => b.sold - a.sold || b.stock - a.stock || a.name.localeCompare(b.name));
      return { brand, items, totalSold: items.reduce((a, p) => a + p.sold, 0) };
    })
    .filter((b) => b.items.length > 0)
    .sort((a, b) => b.totalSold - a.totalSold || a.brand.localeCompare(b.brand));

  const HEADER: (string | number)[] = ['Product', ...channelCols, 'Totaal', 'Voorraad einde maand'];
  const cell = (n: number): string | number => (n === 0 ? '' : n);

  const buildBrandSheet = (title: string, items: Item[]): XLSX.WorkSheet => {
    const data: (string | number)[][] = [
      [title, ...HEADER.slice(1).map(() => '')],
      HEADER.map(() => ''),
      HEADER,
    ];
    const totPerCh: Record<string, number> = {};
    let totSold = 0, totStock = 0;
    for (const p of items) {
      for (const c of channelCols) totPerCh[c] = (totPerCh[c] || 0) + (p.perCh[c] || 0);
      totSold += p.sold;
      totStock += p.stock;
      data.push([p.name, ...channelCols.map((c) => cell(p.perCh[c] || 0)), cell(p.sold), p.stock || '']);
    }
    data.push(HEADER.map(() => ''));
    data.push(['TOTAAL', ...channelCols.map((c) => cell(totPerCh[c] || 0)), cell(totSold), totStock || '']);

    const ws = XLSX.utils.aoa_to_sheet(data);
    for (let c = 0; c < HEADER.length; c++) {
      const hc = ws[XLSX.utils.encode_cell({ r: 2, c })];
      if (hc) hc.s = { ...(hc.s || {}), font: { bold: true }, alignment: { wrapText: true } };
    }
    autoWidth(ws, data);
    return ws;
  };

  const wb = XLSX.utils.book_new();
  const usedSheetNames = new Set<string>();
  const head = `SOA Totaaloverzicht - ${periodLabel} (${channelLabel})`;

  if (brands.length === 0) {
    XLSX.utils.book_append_sheet(wb, buildBrandSheet(head, []), sheetSafeName('SOA Totaal', usedSheetNames));
  } else {
    for (const b of brands) {
      XLSX.utils.book_append_sheet(wb, buildBrandSheet(`${head} - ${b.brand}`, b.items), sheetSafeName(b.brand, usedSheetNames));
    }
  }

  const fileTag = channelLabel === 'Alle kanalen' ? '' : ' (kanaalselectie)';
  XLSX.writeFile(wb, `SOA Totaaloverzicht ${periodLabel}${fileTag} (${formatExportDate()}).xlsx`);
}

function autoWidth(ws: XLSX.WorkSheet, data: (string | number)[][]) {
  const cols: XLSX.ColInfo[] = [];
  if (data.length === 0) return;
  for (let c = 0; c < data[0].length; c++) {
    let max = 10;
    for (const row of data) {
      const len = String(row[c] ?? '').length;
      if (len > max) max = len;
    }
    cols.push({ wch: Math.min(max + 2, 40) });
  }
  ws['!cols'] = cols;
}

/* ── Helpers for new formats ── */

function dateToISOWeek(d: Date): string {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNum = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil((((date.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  return `${date.getUTCFullYear()}${String(weekNo).padStart(2, '0')}`;
}

function parseDDMMYYYY(s: string): Date | null {
  const parts = s.split('-');
  if (parts.length !== 3) return null;
  const [dd, mm, yyyy] = parts.map(Number);
  if (!dd || !mm || !yyyy) return null;
  return new Date(yyyy, mm - 1, dd);
}

function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      inQuotes = !inQuotes;
    } else if (ch === ',' && !inQuotes) {
      result.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  result.push(current);
  return result;
}

/* ── Export Statistics parser (Shopify / Brincr Portaal) ── */

/**
 * Leid het merk af voor een export_statistics-regel. Deze bestanden bevatten
 * geen merkkolom; voorheen kreeg elke rij hardcoded 'Pure Electric', waardoor
 * bijv. NAVEE-steps onder het verkeerde merk belandden. We zoeken daarom het
 * artikel op in de catalogus (op SKU/omschrijving) en gebruiken dat merk;
 * lukt dat niet, dan herkennen we een bekend catalogusmerk in de omschrijving.
 */
function inferStatisticsBrand(articleName: string, sku: string): string {
  const catalogSku = matchToCatalog(articleName, undefined, sku);
  if (catalogSku) {
    const brand = getCatalogBySku(catalogSku)?.brand?.trim();
    if (brand) return normalizeBrand(brand);
  }
  const lower = articleName.toLowerCase();
  for (const entry of getDynamicCatalog()) {
    const brand = entry.brand?.trim();
    if (brand && lower.includes(brand.toLowerCase())) return normalizeBrand(brand);
  }
  return 'Pure Electric';
}

export function parseExportStatistics(
  file: File,
  channel: string,
  market: 'NL' | 'BE' = 'NL'
): Promise<{ rows: DataRow[]; market: 'NL' | 'BE' }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target!.result as ArrayBuffer);
        const wb = XLSX.read(data, { type: 'array' });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const raw: string[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });

        if (raw.length < 2) { resolve({ rows: [], market }); return; }

        const headers = raw[0].map(String);
        const colArtNr = findCol(headers, 'Artikelnummer');
        const colOmschr = findCol(headers, 'Omschrijving');
        const colProducten = findCol(headers, 'Producten');
        const colOrderNr = findCol(headers, 'Ordernummer');
        const colBedrijf = findCol(headers, 'Bedrijfsnaam');
        const colAantal = findCol(headers, 'Aantal producten');
        const colOrderDatum = findCol(headers, 'Orderdatum');

        const hasOrderDetails = colOrderNr >= 0 && colOrderDatum >= 0;
        // Voor Shopify worden alle orders onder één kanaal/winkel gegroepeerd ("Shopify - D2C"),
        // maar de Orderdatum wordt wel per regel gebruikt om de juiste week te bepalen.
        const isShopify = channel.toLowerCase().startsWith('shopify');
        const rows: DataRow[] = [];

        if (hasOrderDetails) {
          let currentOmschr = '';
          let currentSku = '';
          for (let i = 1; i < raw.length; i++) {
            const r = raw[i];
            if (!r || r.length === 0) continue;

            const artNr = cleanStr(r[colArtNr]);
            if (artNr) {
              currentOmschr = cleanStr(r[colOmschr]);
              currentSku = artNr;
            }

            const orderNr = cleanStr(r[colOrderNr]);
            if (!orderNr) continue;

            const bedrijf = cleanStr(r[colBedrijf]);
            const aantal = cleanNum(r[colAantal]);
            const datumStr = cleanStr(r[colOrderDatum]);
            const datum = parseDDMMYYYY(datumStr);
            const week = datum ? dateToISOWeek(datum) : '';

            if (!week || !currentOmschr) continue;

            rows.push({
              w: week, rg: market, mfr: inferStatisticsBrand(currentOmschr, currentSku), pg: '',
              an: currentOmschr, ean: '', sku: currentSku,
              ch: channel,
              st: isShopify ? channel : bedrijf,
              sl: isShopify ? channel : (bedrijf ? `${channel} / ${bedrijf}` : channel),
              p: 0, s: aantal, k: 0,
            });
          }
        } else {
          // Summary only – derive week from filename date
          const dateMatch = file.name.match(/(\d{4}-\d{2}-\d{2})/);
          let week = '';
          if (dateMatch) {
            const [y, m, d] = dateMatch[1].split('-').map(Number);
            week = dateToISOWeek(new Date(y, m - 1, d));
          }

          for (let i = 1; i < raw.length; i++) {
            const r = raw[i];
            if (!r || r.length === 0) continue;
            const artNr = cleanStr(r[colArtNr]);
            if (!artNr) continue;
            const omschr = cleanStr(r[colOmschr]);
            const producten = cleanNum(r[colProducten]);
            if (!omschr) continue;

            rows.push({
              w: week || 'onbekend', rg: market, mfr: inferStatisticsBrand(omschr, artNr), pg: '',
              an: omschr, ean: '', sku: artNr,
              ch: channel, st: '', sl: channel,
              p: 0, s: producten, k: 0,
            });
          }
        }

        resolve({ rows, market });
      } catch (err) { reject(err); }
    };
    reader.onerror = () => reject(new Error('Bestand kon niet worden gelezen'));
    reader.readAsArrayBuffer(file);
  });
}

/* ── FNAC / Vanden Borre CSV parser ── */

export function parseFnacVdbCsv(file: File): Promise<{ rows: DataRow[]; market: 'NL' | 'BE' }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const text = e.target!.result as string;
        const lines = text.split(/\r?\n/);

        // Extract week from "Week YYYYMMDD --> YYYYMMDD" line
        let week = '';
        for (const line of lines) {
          const m = line.match(/Week\s+(\d{8})/);
          if (m) {
            const ds = m[1];
            const y = parseInt(ds.slice(0, 4));
            const mo = parseInt(ds.slice(4, 6)) - 1;
            const d = parseInt(ds.slice(6, 8));
            week = dateToISOWeek(new Date(y, mo, d));
            break;
          }
        }

        // Find header row
        const headerIdx = lines.findIndex((l) => l.startsWith('Marque'));
        if (headerIdx < 0) { resolve({ rows: [], market: 'BE' }); return; }

        const headers = parseCSVLine(lines[headerIdx]);
        const ci = (name: string) => headers.findIndex((h) => h.trim() === name);
        const colMarque = ci('Marque');
        const colFamily = ci('Family');
        const colVdbCode = ci('VDBcode');
        const colArticle = ci('Article Name');
        const colEan = ci('EAN-CODE');
        const colSalesVDB = ci('Sales Qty VDB');
        const colSalesFNAC = ci('Sales Qty FNAC');
        const colStockVDB = ci('Stock Phy VDB');
        const colStockFNAC = ci('Stock Phy FNAC');

        const rows: DataRow[] = [];
        const csvNum = (v: string | undefined) =>
          parseInt((v || '0').replace(/"/g, '').trim()) || 0;

        for (let i = headerIdx + 1; i < lines.length; i++) {
          const line = lines[i].trim();
          if (!line || line.startsWith('TOTAL') || line.startsWith('END')) break;

          const cols = parseCSVLine(line);
          const article = (cols[colArticle] || '').trim();
          if (!article) continue;

          const marque = (cols[colMarque] || '').trim();
          const family = (cols[colFamily] || '').trim();
          const vdbCode = colVdbCode >= 0 ? (cols[colVdbCode] || '').trim() : '';
          const ean = (cols[colEan] || '').trim();
          const salesVDB = csvNum(cols[colSalesVDB]);
          const salesFNAC = csvNum(cols[colSalesFNAC]);
          const stockVDB = csvNum(cols[colStockVDB]);
          const stockFNAC = csvNum(cols[colStockFNAC]);

          // VDB row
          rows.push({
            w: week, rg: 'BE', mfr: normalizeBrand(marque), pg: family,
            an: article, ean, sku: vdbCode, ch: 'Vanden Borre', st: 'Vanden Borre',
            sl: 'Vanden Borre', p: 0, s: salesVDB, k: stockVDB,
          });
          // FNAC row
          rows.push({
            w: week, rg: 'BE', mfr: normalizeBrand(marque), pg: family,
            an: article, ean, sku: vdbCode, ch: 'FNAC', st: 'FNAC',
            sl: 'FNAC', p: 0, s: salesFNAC, k: stockFNAC,
          });
        }

        resolve({ rows, market: 'BE' });
      } catch (err) { reject(err); }
    };
    reader.onerror = () => reject(new Error('Bestand kon niet worden gelezen'));
    reader.readAsText(file);
  });
}

/* ── Product Catalog parser ── */

export function parseCatalogExcel(file: File): Promise<CatalogEntry[]> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target!.result as ArrayBuffer);
        const wb = XLSX.read(data, { type: 'array' });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const raw: string[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });

        if (raw.length < 2) { resolve([]); return; }

        const headers = raw[0].map(String);
        const colSku = findCol(headers, 'SUPPLIER_ORDER_NR', 'Artikelnummer', 'SKU', 'Artikelcode');
        const colName = findCol(headers, 'PRODUCT_NAME', 'Omschrijving', 'Product', 'Naam');
        const colEan = findCol(headers, 'GTIN_1', 'EAN', 'EAN-CODE', 'Barcode');
        const colBrand = findCol(headers, 'LABEL', 'Merk', 'Brand', 'Manufacturer');

        if (colSku < 0 || colName < 0) {
          reject(new Error('Kolom SUPPLIER_ORDER_NR/Artikelnummer en PRODUCT_NAME/Omschrijving niet gevonden'));
          return;
        }

        const entries: CatalogEntry[] = [];
        for (let i = 1; i < raw.length; i++) {
          const r = raw[i];
          if (!r || r.length === 0) continue;
          const sku = cleanStr(r[colSku]);
          const name = cleanStr(r[colName]);
          if (!sku || !name) continue;

          entries.push({
            sku,
            name,
            ean: colEan >= 0 ? cleanStr(r[colEan]) : '',
            brand: colBrand >= 0 ? normalizeBrand(cleanStr(r[colBrand])) : '',
          });
        }

        resolve(entries);
      } catch (err) { reject(err); }
    };
    reader.onerror = () => reject(new Error('Bestand kon niet worden gelezen'));
    reader.readAsArrayBuffer(file);
  });
}
