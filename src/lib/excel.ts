import * as XLSX from 'xlsx';
import type { DataRow } from '../types';
import type { CatalogEntry } from './supabase';
import { stockForArticle, groupBy, resolveProductKey, resolvedDisplayName } from './filters';

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

type RefChannel = 'Big Box' | 'Independent' | 'Online' | 'B2B' | 'D2C - Pure';

/** Derive the retailer / channel pair from a DataRow. */
function retailerAndChannel(r: DataRow): { retailer: string; channel: RefChannel } {
  const ch = r.ch || '';
  if (ch.startsWith('MM-')) return { retailer: 'Media Markt', channel: 'Big Box' };
  if (ch === 'Vanden Borre') return { retailer: 'Vanden Borre', channel: 'Big Box' };
  if (ch === 'FNAC') return { retailer: 'FNAC', channel: 'Big Box' };
  if (ch === 'Shopify') return { retailer: 'Shopify', channel: 'Online' };
  if (ch === 'Brincr') return { retailer: r.st || 'Brincr', channel: 'Independent' };
  return { retailer: ch || r.st || '—', channel: 'Online' };
}

function countryFromMarket(rg: 'NL' | 'BE'): string {
  return rg === 'BE' ? 'Belgium' : 'Netherlands';
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

  // Group by (product × retailer × channel × country) so the output matches the reference layout.
  const groups: Record<string, DataRow[]> = {};
  for (const r of rows) {
    const { retailer, channel } = retailerAndChannel(r);
    const country = countryFromMarket(r.rg);
    const productKey = resolveProductKey(r);
    const key = `${country}||${productKey}||${retailer}||${channel}`;
    (groups[key] ||= []).push(r);
  }

  // Reference layout: column A stays empty, data starts in column B.
  // Row 1: title + instruction
  // Row 3: group header "Sell Out" above the sell-out columns
  // Row 4: column headers (with embedded \r\n for multi-line labels)
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

  const sortedKeys = Object.keys(groups).sort();
  for (const key of sortedKeys) {
    const [country, productKey, retailer, channel] = key.split('||');
    const grp = groups[key];
    const s = grp.reduce((a, r) => a + r.s, 0);
    const p = grp.reduce((a, r) => a + r.p, 0);
    const k = stockForArticle(grp);
    const name = resolvedDisplayName(productKey, aliases);

    // Reference fills only "Total Week Retailer Sell Out" (Online/In Store columns stay blank
    // unless the retailer reports the split explicitly — which our sources do not).
    data.push([
      '',
      country,
      'ADVALDI',
      name,
      retailer,
      channel,
      weekEndSerial,
      '',            // Week Sell Out Online
      '',            // Week Sell Out In Store
      s,             // Total Week Retailer Sell Out
      p || '',       // Total Week Sell In (Distie to Retailer)
      '',            // Total Returns
      k || '',       // Total Retailer Inventory
    ]);
  }

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(data);

  // Format Week Ending column (col G = index 6) as short date for every data row.
  for (let r = 4; r < data.length; r++) {
    const cellRef = XLSX.utils.encode_cell({ r, c: 6 });
    const cell = ws[cellRef];
    if (cell && typeof cell.v === 'number') {
      cell.t = 'n';
      cell.z = 'm/d/yyyy';
    }
  }

  // Wrap text in the header row so \r\n shows as real line breaks.
  for (let c = 0; c < HEADER_ROW.length; c++) {
    const cellRef = XLSX.utils.encode_cell({ r: 3, c });
    const cell = ws[cellRef];
    if (cell) {
      cell.s = { ...(cell.s || {}), alignment: { wrapText: true, vertical: 'center' } };
    }
  }

  autoWidth(ws, data);
  XLSX.utils.book_append_sheet(wb, ws, 'SELL OUT');
  XLSX.writeFile(wb, `Sell Out Report Pure x ADVALDI (${formatExportDate()}).xlsx`);
}

function formatExportDate(): string {
  const d = new Date();
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = d.getFullYear();
  return `${dd}-${mm}-${yyyy}`;
}


export function exportBrandExcel(
  week: string,
  market: string,
  rows: DataRow[],
  aliases: Record<string, string>
): void {
  const brandGroups = groupBy(rows, (r) => r.mfr);
  const allRows: (string | number)[][] = [
    ['Merk', 'SKU', 'Weergavenaam', 'EAN', 'Verkopen', 'Voorraad', 'Inkopen'],
  ];

  for (const [brand, brandRows] of Object.entries(brandGroups)) {
    const productGroups = groupBy(brandRows, resolveProductKey);
    let totalS = 0;
    let totalK = 0;
    let totalP = 0;

    for (const [key, articleRows] of Object.entries(productGroups)) {
      const s = articleRows.reduce((a, r) => a + r.s, 0);
      const k = stockForArticle(articleRows);
      const p = articleRows.reduce((a, r) => a + r.p, 0);
      totalS += s;
      totalK += k;
      totalP += p;
      const name = resolvedDisplayName(key, aliases);
      allRows.push([brand, key, name, articleRows[0].ean, s, k, p]);
    }

    allRows.push([`TOTAAL ${brand}`, '', '', '', totalS, totalK, totalP]);
    allRows.push(['', '', '', '', '', '', '']);
  }

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(allRows);
  autoWidth(ws, allRows);
  XLSX.utils.book_append_sheet(wb, ws, 'Per merk');
  XLSX.writeFile(wb, `ADVALDI_Merken_${week}_${market}.xlsx`);
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
              w: week, rg: market, mfr: 'Pure Electric', pg: '',
              an: currentOmschr, ean: '', sku: currentSku,
              ch: channel, st: bedrijf,
              sl: bedrijf ? `${channel} / ${bedrijf}` : channel,
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
              w: week || 'onbekend', rg: market, mfr: 'Pure Electric', pg: '',
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
