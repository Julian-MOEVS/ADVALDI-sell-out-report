import { useState, useMemo, useCallback } from 'react';
import { useAppStore } from '../store/useAppStore';
import { filtered, weeks, stockForArticle } from '../lib/filters';
import { getDynamicCatalog, matchToCatalog, setDynamicCatalog } from '../lib/catalog';
import { parseCatalogExcel } from '../lib/excel';
import { upsertCatalog, fetchCatalog } from '../lib/supabase';
import type { CatalogEntry } from '../lib/supabase';
import type { DataRow } from '../types';
import Sparkline from '../components/ui/Sparkline';
import StatusBadge from '../components/ui/StatusBadge';
import { Upload, FileSpreadsheet, ChevronDown, ChevronUp } from 'lucide-react';

interface ProductRow {
  key: string;        // unique key: catalog SKU or original article name
  sku: string;
  name: string;
  ean: string;
  brand: string;
  pg: string;
  s: number;
  k: number;
  p: number;
  weekSales: number[];
  hasSalesData: boolean;
  articleNames: string[]; // original article names (for detail page linking)
}

export default function Products() {
  const { allData, selectedWeek, selectedChannel, setActivePage } = useAppStore();
  const data = allData();
  const rows = useMemo(() => filtered(data, selectedWeek, selectedChannel), [data, selectedWeek, selectedChannel]);

  const [search, setSearch] = useState('');
  const [showCatalog, setShowCatalog] = useState(false);
  const [catalogStatus, setCatalogStatus] = useState('');
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [filter, setFilter] = useState<'all' | 'with-sales' | 'no-sales'>('all');

  const allWeeks = weeks(data);
  const catalog = useMemo(() => getDynamicCatalog(), [data]);

  // Build product list: resolve each row to catalog SKU, then group
  const products = useMemo((): ProductRow[] => {
    // 1. Resolve every sell-out row to a product key (catalog SKU or original name)
    const resolvedRows: { key: string; row: DataRow }[] = rows.map((r) => {
      const catalogSku = matchToCatalog(r.an, r.ean, r.sku);
      return { key: catalogSku || r.an, row: r };
    });

    // 2. Group resolved rows by product key
    const groups: Record<string, DataRow[]> = {};
    const articleNamesPerKey: Record<string, Set<string>> = {};
    for (const { key, row } of resolvedRows) {
      if (!groups[key]) {
        groups[key] = [];
        articleNamesPerKey[key] = new Set();
      }
      groups[key].push(row);
      articleNamesPerKey[key].add(row.an);
    }

    // Track which catalog SKUs have sales data
    const matchedSkus = new Set<string>(Object.keys(groups));
    const result: ProductRow[] = [];

    // 3. Build product rows from grouped data
    for (const [key, gRows] of Object.entries(groups)) {
      const s = gRows.reduce((a, r) => a + r.s, 0);
      const k = stockForArticle(gRows);
      const p = gRows.reduce((a, r) => a + r.p, 0);

      // Build per-week sales
      const weekMap: Record<string, number> = {};
      for (const r of gRows) {
        weekMap[r.w] = (weekMap[r.w] || 0) + r.s;
      }
      const weekSales = allWeeks.map((w) => weekMap[w] || 0);

      const catEntry = catalog.find((c) => c.sku === key);
      const firstRow = gRows[0];

      result.push({
        key,
        sku: catEntry?.sku || firstRow.sku || '',
        name: catEntry?.name || firstRow.an,
        ean: catEntry?.ean || firstRow.ean || '',
        brand: catEntry?.brand || firstRow.mfr || '',
        pg: firstRow.pg || '',
        s, k, p, weekSales,
        hasSalesData: true,
        articleNames: [...articleNamesPerKey[key]],
      });
    }

    // 4. Add catalog products without any sales data
    for (const cat of catalog) {
      if (!matchedSkus.has(cat.sku)) {
        result.push({
          key: cat.sku,
          sku: cat.sku,
          name: cat.name,
          ean: cat.ean,
          brand: cat.brand,
          pg: '',
          s: 0, k: 0, p: 0,
          weekSales: allWeeks.map(() => 0),
          hasSalesData: false,
          articleNames: [],
        });
      }
    }

    return result.sort((a, b) => b.s - a.s || a.name.localeCompare(b.name));
  }, [rows, allWeeks, catalog]);

  const filtered2 = useMemo(() => {
    let list = products;

    if (filter === 'with-sales') list = list.filter((p) => p.hasSalesData);
    else if (filter === 'no-sales') list = list.filter((p) => !p.hasSalesData);

    if (!search) return list;
    const q = search.toLowerCase();
    return list.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.brand.toLowerCase().includes(q) ||
        p.ean.toLowerCase().includes(q) ||
        p.sku.toLowerCase().includes(q) ||
        p.articleNames.some((an) => an.toLowerCase().includes(q))
    );
  }, [products, search, filter]);

  const totalCatalog = catalog.length;
  const withSales = products.filter((p) => p.hasSalesData).length;
  const withoutSales = products.filter((p) => !p.hasSalesData).length;

  const handleCatalogUpload = useCallback(async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setCatalogLoading(true);
    setCatalogStatus('');

    try {
      let allEntries: CatalogEntry[] = [];
      for (const file of Array.from(files)) {
        const entries = await parseCatalogExcel(file);
        allEntries = [...allEntries, ...entries];
      }

      if (allEntries.length === 0) {
        setCatalogStatus('Geen producten gevonden in bestand');
        setCatalogLoading(false);
        return;
      }

      const result = await upsertCatalog(allEntries);
      if (result.success) {
        const fresh = await fetchCatalog();
        setDynamicCatalog(fresh);
        setCatalogStatus(`${result.count} producten geüpload naar catalogus`);
      } else {
        setCatalogStatus(`Fout: slechts ${result.count} van ${allEntries.length} opgeslagen`);
      }
    } catch (err) {
      setCatalogStatus(`Fout bij inlezen: ${err instanceof Error ? err.message : 'onbekend'}`);
    }
    setCatalogLoading(false);
  }, []);

  return (
    <div className="space-y-4">
      {/* Catalog upload section */}
      <div className="bg-white border border-bg4 rounded-3xl shadow-sm overflow-hidden">
        <button
          onClick={() => setShowCatalog(!showCatalog)}
          className="w-full flex items-center justify-between px-4 py-3 hover:bg-bg/50 transition"
        >
          <div className="flex items-center gap-2">
            <FileSpreadsheet size={16} className="text-accent" />
            <span className="text-sm font-medium">Productcatalogus</span>
            <span className="text-xs text-dark/40">({totalCatalog} producten)</span>
          </div>
          {showCatalog ? <ChevronUp size={16} className="text-dark/40" /> : <ChevronDown size={16} className="text-dark/40" />}
        </button>

        {showCatalog && (
          <div className="px-4 pb-4 space-y-3 border-t border-bg4">
            <p className="text-xs text-dark/50 mt-3">
              Upload een productcatalogus (.xlsx) om weergavenamen, EAN-codes en merken te koppelen.
              Kolommen: SUPPLIER_ORDER_NR, PRODUCT_NAME, GTIN_1, LABEL.
            </p>
            <div className="flex items-center gap-3">
              <label className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-accent-light to-accent text-white rounded-lg hover:opacity-90 transition text-sm cursor-pointer">
                <Upload size={14} />
                Catalogus uploaden
                <input
                  type="file"
                  accept=".xlsx,.xls"
                  multiple
                  className="hidden"
                  onChange={(e) => handleCatalogUpload(e.target.files)}
                />
              </label>
              {catalogLoading && <span className="text-sm text-dark/50">Uploaden...</span>}
              {catalogStatus && !catalogLoading && (
                <span className={`text-sm ${catalogStatus.startsWith('Fout') ? 'text-danger' : 'text-success'}`}>
                  {catalogStatus}
                </span>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Filter + search */}
      <div className="flex flex-wrap gap-3 items-center">
        <input
          type="text"
          placeholder="Zoek op naam, merk, EAN of SKU..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="flex-1 min-w-[200px] bg-bg2 border border-bg4 rounded-lg px-4 py-2 text-sm focus:outline-none focus:border-accent"
        />
        <div className="flex gap-1">
          {([
            { key: 'all', label: `Alle (${products.length})` },
            { key: 'with-sales', label: `Met data (${withSales})` },
            { key: 'no-sales', label: `Zonder data (${withoutSales})` },
          ] as const).map((f) => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={`px-3 py-1.5 rounded-lg text-xs transition ${
                filter === f.key
                  ? 'bg-gradient-to-r from-accent-light to-accent text-white'
                  : 'bg-bg text-dark/50 hover:text-dark'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      <div className="bg-white border border-bg4 rounded-3xl shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-dark/40 text-xs uppercase bg-bg">
                <th className="p-3">Product</th>
                <th className="p-3">SKU</th>
                <th className="p-3">EAN</th>
                <th className="p-3">Merk</th>
                <th className="p-3 text-right">Verkopen</th>
                <th className="p-3 text-right">Voorraad</th>
                <th className="p-3 text-right">Inkopen</th>
                <th className="p-3">Trend</th>
                <th className="p-3">Status</th>
              </tr>
            </thead>
            <tbody>
              {filtered2.map((p) => (
                <tr key={p.key} className={`border-t border-bg4 hover:bg-bg/50 transition ${!p.hasSalesData ? 'opacity-50' : ''}`}>
                  <td className="p-3 max-w-[220px]">
                    <button
                      onClick={() => setActivePage('productdetail', p.articleNames[0] || p.name)}
                      className="text-accent hover:underline truncate block text-left max-w-full"
                      title={p.articleNames.length > 1 ? `Bronnen: ${p.articleNames.join(', ')}` : p.name}
                    >
                      {p.name}
                    </button>
                    {p.articleNames.length > 1 && (
                      <span className="text-[10px] text-dark/30">{p.articleNames.length} bronnen</span>
                    )}
                  </td>
                  <td className="p-3 text-dark/40 font-mono text-xs">{p.sku}</td>
                  <td className="p-3 text-dark/40 font-mono text-xs">{p.ean}</td>
                  <td className="p-3 text-dark/50">{p.brand}</td>
                  <td className="p-3 text-right font-mono">{p.s || '—'}</td>
                  <td className="p-3 text-right font-mono">{p.k || '—'}</td>
                  <td className="p-3 text-right font-mono">{p.p || '—'}</td>
                  <td className="p-3">{p.hasSalesData ? <Sparkline values={p.weekSales} /> : '—'}</td>
                  <td className="p-3">
                    {p.hasSalesData
                      ? <StatusBadge sales={p.s} stock={p.k} />
                      : <span className="text-xs text-dark/30 bg-bg px-2 py-0.5 rounded-full">Geen data</span>
                    }
                  </td>
                </tr>
              ))}
              {filtered2.length === 0 && (
                <tr>
                  <td colSpan={9} className="p-8 text-center text-dark/40">
                    {totalCatalog === 0
                      ? 'Geen catalogus geladen. Upload eerst een productcatalogus hierboven.'
                      : 'Geen producten gevonden'
                    }
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
