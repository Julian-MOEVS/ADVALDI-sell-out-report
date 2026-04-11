import { useState, useMemo, useCallback } from 'react';
import { useAppStore } from '../store/useAppStore';
import { filtered, weeks, groupBy, stockForArticle } from '../lib/filters';
import { getDynamicCatalog, matchToCatalog, setDynamicCatalog } from '../lib/catalog';
import { parseCatalogExcel } from '../lib/excel';
import { upsertCatalog, fetchCatalog } from '../lib/supabase';
import type { CatalogEntry } from '../lib/supabase';
import Sparkline from '../components/ui/Sparkline';
import StatusBadge from '../components/ui/StatusBadge';
import { Upload, FileSpreadsheet, ChevronDown, ChevronUp } from 'lucide-react';

interface ProductRow {
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
}

export default function Products() {
  const { allData, selectedWeek, selectedMarket, setActivePage } = useAppStore();
  const data = allData();
  const rows = useMemo(() => filtered(data, selectedWeek, selectedMarket), [data, selectedWeek, selectedMarket]);

  const [search, setSearch] = useState('');
  const [showCatalog, setShowCatalog] = useState(false);
  const [catalogStatus, setCatalogStatus] = useState('');
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [filter, setFilter] = useState<'all' | 'with-sales' | 'no-sales'>('all');

  const allWeeks = weeks(data);
  const catalog = useMemo(() => getDynamicCatalog(), [data]);

  // Build product list: start from catalog, merge in sales data
  const products = useMemo((): ProductRow[] => {
    // Group sell-out data by article name
    const salesByArticle = groupBy(rows, (r) => r.an);

    // Track which catalog SKUs have been matched
    const matchedSkus = new Set<string>();
    const result: ProductRow[] = [];

    // 1. Process sell-out articles and match to catalog
    for (const [an, aRows] of Object.entries(salesByArticle)) {
      const s = aRows.reduce((a, r) => a + r.s, 0);
      const k = stockForArticle(aRows);
      const p = aRows.reduce((a, r) => a + r.p, 0);
      const byWeek = groupBy(aRows, (r) => r.w);
      const weekSales = allWeeks.map((w) =>
        byWeek[w] ? byWeek[w].reduce((a, r) => a + r.s, 0) : 0
      );

      const catalogSku = matchToCatalog(an, aRows[0].ean, aRows[0].sku);
      const catEntry = catalogSku ? catalog.find((c) => c.sku === catalogSku) : undefined;

      if (catalogSku) matchedSkus.add(catalogSku);

      result.push({
        sku: catEntry?.sku || aRows[0].sku || '',
        name: catEntry?.name || an,
        ean: catEntry?.ean || aRows[0].ean || '',
        brand: catEntry?.brand || aRows[0].mfr || '',
        pg: aRows[0].pg || '',
        s, k, p, weekSales,
        hasSalesData: true,
      });
    }

    // 2. Add catalog products without sales data
    for (const cat of catalog) {
      if (!matchedSkus.has(cat.sku)) {
        result.push({
          sku: cat.sku,
          name: cat.name,
          ean: cat.ean,
          brand: cat.brand,
          pg: '',
          s: 0, k: 0, p: 0,
          weekSales: allWeeks.map(() => 0),
          hasSalesData: false,
        });
      }
    }

    return result.sort((a, b) => b.s - a.s || a.name.localeCompare(b.name));
  }, [rows, allWeeks, catalog]);

  const filtered2 = useMemo(() => {
    let list = products;

    // Filter by sales status
    if (filter === 'with-sales') list = list.filter((p) => p.hasSalesData);
    else if (filter === 'no-sales') list = list.filter((p) => !p.hasSalesData);

    // Search
    if (!search) return list;
    const q = search.toLowerCase();
    return list.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.brand.toLowerCase().includes(q) ||
        p.ean.toLowerCase().includes(q) ||
        p.sku.toLowerCase().includes(q)
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
                <tr key={p.sku || p.name} className={`border-t border-bg4 hover:bg-bg/50 transition ${!p.hasSalesData ? 'opacity-50' : ''}`}>
                  <td className="p-3 max-w-[220px]">
                    <button
                      onClick={() => setActivePage('productdetail', p.name)}
                      className="text-accent hover:underline truncate block text-left max-w-full"
                      title={p.name}
                    >
                      {p.name}
                    </button>
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
