import * as XLSX from 'xlsx';
import type { DataRow } from '../types';
import { stockForArticle, groupBy } from './filters';

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

          const ch = colMap.salesChannel >= 0 ? cleanStr(r[colMap.salesChannel]) : '';
          const st = cleanStr(r[colMap.store]);
          const sl = [ch, st].filter(Boolean).join(' / ');

          rows.push({
            w,
            rg: market,
            mfr: cleanStr(r[colMap.manufacturer]),
            pg: cleanStr(r[colMap.productGroup]),
            an: cleanStr(r[colMap.articleName]),
            ean: cleanStr(r[colMap.ean]),
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

export function exportWeekExcel(
  week: string,
  market: string,
  rows: DataRow[],
  prevRows: DataRow[],
  aliases: Record<string, string>
): void {
  const prevByAn = groupBy(prevRows, (r) => r.an);

  const prodData: (string | number)[][] = [
    ['Week', 'Markt', 'Merk', 'Artikel (origineel)', 'Weergavenaam', 'Productgroep', 'EAN', 'Verkopen', 'Delta vorige week', 'Voorraad', 'Inkopen'],
  ];

  const articleGroups = groupBy(rows, (r) => r.an);
  for (const [an, articleRows] of Object.entries(articleGroups)) {
    const s = articleRows.reduce((a, r) => a + r.s, 0);
    const k = stockForArticle(articleRows);
    const p = articleRows.reduce((a, r) => a + r.p, 0);
    const prev = prevByAn[an];
    const prevS = prev ? prev.reduce((a, r) => a + r.s, 0) : 0;
    const delta = prev ? s - prevS : 0;
    const first = articleRows[0];
    prodData.push([
      week, market, first.mfr, an, aliases[an] || an, first.pg, first.ean,
      s, delta, k, p,
    ]);
  }

  const storeGroups = groupBy(rows, (r) => r.sl || r.st);
  const storeData: (string | number)[][] = [
    ['Week', 'Markt', 'Winkel', 'Verkopen', 'Voorraad'],
  ];
  for (const [store, storeRows] of Object.entries(storeGroups)) {
    storeData.push([
      week, market, store,
      storeRows.reduce((a, r) => a + r.s, 0),
      storeRows.reduce((a, r) => a + r.k, 0),
    ]);
  }

  const wb = XLSX.utils.book_new();
  const ws1 = XLSX.utils.aoa_to_sheet(prodData);
  const ws2 = XLSX.utils.aoa_to_sheet(storeData);

  autoWidth(ws1, prodData);
  autoWidth(ws2, storeData);

  XLSX.utils.book_append_sheet(wb, ws1, 'Producten');
  XLSX.utils.book_append_sheet(wb, ws2, 'Winkels');
  XLSX.writeFile(wb, `MOEVS_Week_${week}_${market}.xlsx`);
}

export function exportBrandExcel(
  week: string,
  market: string,
  rows: DataRow[],
  aliases: Record<string, string>
): void {
  const brandGroups = groupBy(rows, (r) => r.mfr);
  const allRows: (string | number)[][] = [
    ['Merk', 'Artikel (origineel)', 'Weergavenaam', 'EAN', 'Verkopen', 'Voorraad', 'Inkopen'],
  ];

  for (const [brand, brandRows] of Object.entries(brandGroups)) {
    const articleGroups = groupBy(brandRows, (r) => r.an);
    let totalS = 0;
    let totalK = 0;
    let totalP = 0;

    for (const [an, articleRows] of Object.entries(articleGroups)) {
      const s = articleRows.reduce((a, r) => a + r.s, 0);
      const k = stockForArticle(articleRows);
      const p = articleRows.reduce((a, r) => a + r.p, 0);
      totalS += s;
      totalK += k;
      totalP += p;
      allRows.push([brand, an, aliases[an] || an, articleRows[0].ean, s, k, p]);
    }

    allRows.push([`TOTAAL ${brand}`, '', '', '', totalS, totalK, totalP]);
    allRows.push(['', '', '', '', '', '', '']);
  }

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(allRows);
  autoWidth(ws, allRows);
  XLSX.utils.book_append_sheet(wb, ws, 'Per merk');
  XLSX.writeFile(wb, `MOEVS_Merken_${week}_${market}.xlsx`);
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
