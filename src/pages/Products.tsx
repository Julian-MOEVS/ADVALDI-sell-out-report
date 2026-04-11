import { useState, useMemo, useCallback } from 'react';
import { useAppStore } from '../store/useAppStore';
import { filtered, weeks, groupBy, stockForArticle } from '../lib/filters';
import { catalogEan, setDynamicCatalog, getDynamicCatalog } from '../lib/catalog';
import { parseCatalogExcel } from '../lib/excel';
import { upsertCatalog, fetchCatalog } from '../lib/supabase';
import Sparkline from '../components/ui/Sparkline';
import StatusBadge from '../components/ui/StatusBadge';
import { Upload, FileSpreadsheet, ChevronDown, ChevronUp } from 'lucide-react';

export default function Products() {
  const { allData, selectedWeek, selectedMarket, displayName, setActivePage } = useAppStore();
  const data = allData();
  const rows = useMemo(() => filtered(data, selectedWeek, selectedMarket), [data, selectedWeek, selectedMarket]);

  const [search, setSearch] = useState('');
  const [showCatalog, setShowCatalog] = useState(false);
  const [catalogStatus, setCatalogStatus] = useState('');
  const [catalogLoading, setCatalogLoading] = useState(false);

  const allWeeks = weeks(data);

  const products = useMemo(() => {
    const g = groupBy(rows, (r) => r.an);
    return Object.entries(g)
      .map(([an, aRows]) => {
        const s = aRows.reduce((a, r) => a + r.s, 0);
        const k = stockForArticle(aRows);
        const p = aRows.reduce((a, r) => a + r.p, 0);
        const mfr = aRows[0].mfr;
        const pg = aRows[0].pg;
        const ean = aRows[0].ean || catalogEan(an) || '';
        const sku = aRows[0].sku || '';

        // Sparkline per week
        const byWeek = groupBy(aRows, (r) => r.w);
        const weekSales = allWeeks.map((w) =>
          byWeek[w] ? byWeek[w].reduce((a, r) => a + r.s, 0) : 0
        );

        return { an, mfr, pg, ean, sku, s, k, p, weekSales };
      })
      .sort((a, b) => b.s - a.s);
  }, [rows, allWeeks]);

  const filtered2 = useMemo(() => {
    if (!search) return products;
    const q = search.toLowerCase();
    return products.filter(
      (p) =>
        p.an.toLowerCase().includes(q) ||
        p.mfr.toLowerCase().includes(q) ||
        p.ean.toLowerCase().includes(q) ||
        p.sku.toLowerCase().includes(q) ||
        displayName(p.an).toLowerCase().includes(q)
    );
  }, [products, search, displayName]);

  const catalogCount = getDynamicCatalog().length;

  const handleCatalogUpload = useCallback(async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setCatalogLoading(true);
    setCatalogStatus('');

    try {
      let allEntries: Awaited<ReturnType<typeof parseCatalogExcel>> = [];
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
        // Refresh catalog
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
            <span className="text-xs text-dark/40">({catalogCount} producten)</span>
          </div>
          {showCatalog ? <ChevronUp size={16} className="text-dark/40" /> : <ChevronDown size={16} className="text-dark/40" />}
        </button>

        {showCatalog && (
          <div className="px-4 pb-4 space-y-3 border-t border-bg4">
            <p className="text-xs text-dark/50 mt-3">
              Upload een productcatalogus (.xlsx) om weergavenamen, EAN-codes en merken te koppelen.
              Ondersteunde kolommen: SUPPLIER_ORDER_NR / Artikelnummer, PRODUCT_NAME / Omschrijving, GTIN_1 / EAN, LABEL / Merk.
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

      <input
        type="text"
        placeholder="Zoek op artikel, merk, EAN of SKU..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="w-full bg-bg2 border border-bg4 rounded-lg px-4 py-2 text-sm focus:outline-none focus:border-accent"
      />

      <div className="bg-white border border-bg4 rounded-3xl shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-dark/40 text-xs uppercase bg-bg">
                <th className="p-3">Artikel</th>
                <th className="p-3">SKU</th>
                <th className="p-3">EAN</th>
                <th className="p-3">Merk</th>
                <th className="p-3">Productgroep</th>
                <th className="p-3 text-right">Verkopen</th>
                <th className="p-3 text-right">Voorraad</th>
                <th className="p-3 text-right">Inkopen</th>
                <th className="p-3">Trend</th>
                <th className="p-3">Status</th>
              </tr>
            </thead>
            <tbody>
              {filtered2.map((p) => (
                <tr key={p.an} className="border-t border-bg4 hover:bg-bg/50 transition">
                  <td className="p-3 max-w-[220px]">
                    <button
                      onClick={() => setActivePage('productdetail', p.an)}
                      className="text-accent hover:underline truncate block text-left max-w-full"
                      title={p.an}
                    >
                      {displayName(p.an)}
                    </button>
                  </td>
                  <td className="p-3 text-dark/40 font-mono text-xs">{p.sku}</td>
                  <td className="p-3 text-dark/40 font-mono text-xs">{p.ean}</td>
                  <td className="p-3 text-dark/50">{p.mfr}</td>
                  <td className="p-3 text-dark/50">{p.pg}</td>
                  <td className="p-3 text-right font-mono">{p.s}</td>
                  <td className="p-3 text-right font-mono">{p.k}</td>
                  <td className="p-3 text-right font-mono">{p.p}</td>
                  <td className="p-3"><Sparkline values={p.weekSales} /></td>
                  <td className="p-3"><StatusBadge sales={p.s} stock={p.k} /></td>
                </tr>
              ))}
              {filtered2.length === 0 && (
                <tr>
                  <td colSpan={10} className="p-8 text-center text-dark/40">
                    Geen producten gevonden
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
