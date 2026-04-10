import { useState, useMemo } from 'react';
import { useAppStore } from '../store/useAppStore';
import { filtered, weeks, groupBy, stockForArticle } from '../lib/filters';
import { catalogEan } from '../lib/catalog';
import Sparkline from '../components/ui/Sparkline';
import StatusBadge from '../components/ui/StatusBadge';

export default function Products() {
  const { allData, selectedWeek, selectedMarket, displayName, setActivePage } = useAppStore();
  const data = allData();
  const rows = useMemo(() => filtered(data, selectedWeek, selectedMarket), [data, selectedWeek, selectedMarket]);

  const [search, setSearch] = useState('');

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

        // Sparkline per week
        const byWeek = groupBy(aRows, (r) => r.w);
        const weekSales = allWeeks.map((w) =>
          byWeek[w] ? byWeek[w].reduce((a, r) => a + r.s, 0) : 0
        );

        return { an, mfr, pg, ean, s, k, p, weekSales };
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
        displayName(p.an).toLowerCase().includes(q)
    );
  }, [products, search, displayName]);

  return (
    <div className="space-y-4">
      <input
        type="text"
        placeholder="Zoek op artikel, merk of EAN..."
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
                  <td colSpan={9} className="p-8 text-center text-dark/40">
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
