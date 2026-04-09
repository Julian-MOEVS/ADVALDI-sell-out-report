import { useMemo } from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  BarChart, Bar,
} from 'recharts';
import { useAppStore } from '../store/useAppStore';
import { filtered, weeks, groupBy, stockForArticle } from '../lib/filters';
import StatCard from '../components/ui/StatCard';
import MarketPill from '../components/ui/MarketPill';
import StatusBadge from '../components/ui/StatusBadge';
import { ArrowLeft, ShoppingCart, Package, TrendingUp, Store } from 'lucide-react';

export default function ProductDetail() {
  const { allData, detailId, selectedWeek, selectedMarket, displayName, setActivePage } = useAppStore();
  const data = allData();
  const articleName = detailId;

  const allRows = useMemo(() => data.filter((r) => r.an === articleName), [data, articleName]);
  const rows = useMemo(() => filtered(allRows, selectedWeek, selectedMarket), [allRows, selectedWeek, selectedMarket]);

  const allWeeks = weeks(data);
  const first = allRows[0];

  const totalSales = rows.reduce((a, r) => a + r.s, 0);
  const totalStock = stockForArticle(rows);
  const totalPurchase = rows.reduce((a, r) => a + r.p, 0);
  const storeCount = new Set(rows.map((r) => r.sl || r.st)).size;

  // Sales per week (trend)
  const weekTrend = useMemo(() => {
    const byWeek = groupBy(allRows, (r) => r.w);
    return allWeeks.map((w) => {
      const wRows = byWeek[w] || [];
      return {
        week: `W${w.slice(-2)}`,
        verkopen: wRows.reduce((a, r) => a + r.s, 0),
        voorraad: wRows.reduce((a, r) => a + r.k, 0),
        inkopen: wRows.reduce((a, r) => a + r.p, 0),
      };
    });
  }, [allRows, allWeeks]);

  // Per store breakdown
  const storeBreakdown = useMemo(() => {
    const g = groupBy(rows, (r) => r.sl || r.st);
    return Object.entries(g)
      .map(([store, sRows]) => ({
        store,
        market: sRows[0].rg,
        sales: sRows.reduce((a, r) => a + r.s, 0),
        stock: stockForArticle(sRows),
        purchase: sRows.reduce((a, r) => a + r.p, 0),
      }))
      .sort((a, b) => b.sales - a.sales);
  }, [rows]);

  // Per week table
  const weekBreakdown = useMemo(() => {
    const byWeek = groupBy(rows, (r) => r.w);
    return weeks(rows).map((w) => {
      const wRows = byWeek[w] || [];
      return {
        w,
        sales: wRows.reduce((a, r) => a + r.s, 0),
        stock: wRows.reduce((a, r) => a + r.k, 0),
        purchase: wRows.reduce((a, r) => a + r.p, 0),
        stores: new Set(wRows.map((r) => r.sl || r.st)).size,
      };
    });
  }, [rows]);

  if (!first) {
    return (
      <div className="text-center text-gray-500 py-12">
        <p>Product niet gevonden.</p>
        <button onClick={() => setActivePage('products')} className="mt-3 text-accent hover:underline">
          Terug naar producten
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start gap-4">
        <button
          onClick={() => setActivePage('products')}
          className="mt-1 p-1.5 rounded-lg bg-bg3 hover:bg-bg4 transition text-gray-400 hover:text-white"
        >
          <ArrowLeft size={18} />
        </button>
        <div className="flex-1 min-w-0">
          <h2 className="text-lg font-semibold truncate" title={articleName}>
            {displayName(articleName)}
          </h2>
          <div className="flex flex-wrap items-center gap-2 mt-1 text-sm text-gray-400">
            <span className="px-2 py-0.5 bg-bg3 rounded text-xs">{first.mfr}</span>
            <span className="px-2 py-0.5 bg-bg3 rounded text-xs">{first.pg}</span>
            <span className="text-xs text-gray-500">EAN: {first.ean}</span>
            <StatusBadge sales={totalSales} stock={totalStock} />
          </div>
          {displayName(articleName) !== articleName && (
            <p className="text-xs text-gray-500 mt-1 truncate" title={articleName}>
              Origineel: {articleName}
            </p>
          )}
        </div>
      </div>

      {/* KPI */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="Verkopen" value={totalSales.toLocaleString('nl-NL')} icon={<ShoppingCart size={16} />} />
        <StatCard label="Voorraad" value={totalStock.toLocaleString('nl-NL')} icon={<Package size={16} />} sub="meest recente week" />
        <StatCard label="Inkopen" value={totalPurchase.toLocaleString('nl-NL')} icon={<TrendingUp size={16} />} />
        <StatCard label="Winkels" value={storeCount} icon={<Store size={16} />} />
      </div>

      {/* Trend charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-bg2 border border-white/5 rounded-xl p-4">
          <h3 className="text-sm font-medium text-gray-300 mb-3">Verkopen per week</h3>
          <ResponsiveContainer width="100%" height={250}>
            <LineChart data={weekTrend}>
              <CartesianGrid strokeDasharray="3 3" stroke="#24242c" />
              <XAxis dataKey="week" stroke="#666" fontSize={12} />
              <YAxis stroke="#666" fontSize={12} />
              <Tooltip contentStyle={{ background: '#141418', border: '1px solid #24242c', borderRadius: 8 }} />
              <Line type="monotone" dataKey="verkopen" stroke="#7c6af7" strokeWidth={2} dot={{ r: 3 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-bg2 border border-white/5 rounded-xl p-4">
          <h3 className="text-sm font-medium text-gray-300 mb-3">Voorraad & inkopen per week</h3>
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={weekTrend}>
              <CartesianGrid strokeDasharray="3 3" stroke="#24242c" />
              <XAxis dataKey="week" stroke="#666" fontSize={12} />
              <YAxis stroke="#666" fontSize={12} />
              <Tooltip contentStyle={{ background: '#141418', border: '1px solid #24242c', borderRadius: 8 }} />
              <Bar dataKey="voorraad" fill="#3b82f6" radius={[4, 4, 0, 0]} />
              <Bar dataKey="inkopen" fill="#f59e0b" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Per store */}
      <div className="bg-bg2 border border-white/5 rounded-xl p-4">
        <h3 className="text-sm font-medium text-gray-300 mb-3">Per winkel</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-gray-500 text-xs uppercase">
                <th className="pb-2 pr-3">#</th>
                <th className="pb-2 pr-3">Winkel</th>
                <th className="pb-2 pr-3">Markt</th>
                <th className="pb-2 pr-3 text-right">Verkopen</th>
                <th className="pb-2 pr-3 text-right">Voorraad</th>
                <th className="pb-2 text-right">Inkopen</th>
              </tr>
            </thead>
            <tbody>
              {storeBreakdown.map((s, i) => (
                <tr key={s.store} className="border-t border-white/5 hover:bg-bg3/50 transition">
                  <td className="py-1.5 pr-3 text-gray-500">{i + 1}</td>
                  <td className="py-1.5 pr-3">
                    <button
                      onClick={() => setActivePage('storedetail', s.store)}
                      className="text-accent hover:underline truncate max-w-[220px] block text-left"
                      title={s.store}
                    >
                      {s.store}
                    </button>
                  </td>
                  <td className="py-1.5 pr-3"><MarketPill market={s.market} /></td>
                  <td className="py-1.5 pr-3 text-right font-mono">{s.sales}</td>
                  <td className="py-1.5 pr-3 text-right font-mono">{s.stock}</td>
                  <td className="py-1.5 text-right font-mono">{s.purchase}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Per week */}
      <div className="bg-bg2 border border-white/5 rounded-xl p-4">
        <h3 className="text-sm font-medium text-gray-300 mb-3">Per week</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-gray-500 text-xs uppercase">
                <th className="pb-2 pr-3">Week</th>
                <th className="pb-2 pr-3 text-right">Verkopen</th>
                <th className="pb-2 pr-3 text-right">Voorraad</th>
                <th className="pb-2 pr-3 text-right">Inkopen</th>
                <th className="pb-2 text-right">Winkels</th>
              </tr>
            </thead>
            <tbody>
              {weekBreakdown.map((w) => (
                <tr key={w.w} className="border-t border-white/5">
                  <td className="py-1.5 pr-3">W{w.w.slice(-2)} ({w.w})</td>
                  <td className="py-1.5 pr-3 text-right font-mono">{w.sales}</td>
                  <td className="py-1.5 pr-3 text-right font-mono">{w.stock}</td>
                  <td className="py-1.5 pr-3 text-right font-mono">{w.purchase}</td>
                  <td className="py-1.5 text-right font-mono">{w.stores}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
