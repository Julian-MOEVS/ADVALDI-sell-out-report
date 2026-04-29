import { useMemo } from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  BarChart, Bar,
} from 'recharts';
import { useAppStore } from '../store/useAppStore';
import { filtered, weeks, groupBy, stockForArticle } from '../lib/filters';
import StatCard from '../components/ui/StatCard';
import ChannelPill from '../components/ui/ChannelPill';
import Sparkline from '../components/ui/Sparkline';
import { ArrowLeft, ShoppingCart, Package, TrendingUp, Box } from 'lucide-react';

export default function StoreDetail() {
  const { allData, detailId, selectedWeek, selectedChannel, displayName, setActivePage } = useAppStore();
  const data = allData();
  const storeName = detailId;

  const allRows = useMemo(() => data.filter((r) => (r.sl || r.st) === storeName), [data, storeName]);
  const rows = useMemo(() => filtered(allRows, selectedWeek, selectedChannel), [allRows, selectedWeek, selectedChannel]);

  const allWeeks = weeks(data);
  const first = allRows[0];

  const totalSales = rows.reduce((a, r) => a + r.s, 0);
  const totalStock = stockForArticle(rows);
  const totalPurchase = rows.reduce((a, r) => a + r.p, 0);
  const articleCount = new Set(rows.map((r) => r.an)).size;

  // Trend per week
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

  // Products in this store
  const productBreakdown = useMemo(() => {
    const g = groupBy(rows, (r) => r.an);
    return Object.entries(g)
      .map(([an, aRows]) => {
        const s = aRows.reduce((a, r) => a + r.s, 0);
        const k = stockForArticle(aRows);
        const p = aRows.reduce((a, r) => a + r.p, 0);
        const byWeek = groupBy(aRows, (r) => r.w);
        const weekSales = allWeeks.map((w) =>
          byWeek[w] ? byWeek[w].reduce((a, r) => a + r.s, 0) : 0
        );
        return { an, mfr: aRows[0].mfr, pg: aRows[0].pg, s, k, p, weekSales };
      })
      .sort((a, b) => b.s - a.s);
  }, [rows, allWeeks]);

  // Brand breakdown
  const brandBreakdown = useMemo(() => {
    const g = groupBy(rows, (r) => r.mfr);
    return Object.entries(g)
      .map(([brand, bRows]) => ({
        brand,
        sales: bRows.reduce((a, r) => a + r.s, 0),
      }))
      .sort((a, b) => b.sales - a.sales)
      .slice(0, 8);
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
        articles: new Set(wRows.map((r) => r.an)).size,
      };
    });
  }, [rows]);

  if (!first) {
    return (
      <div className="text-center text-dark/40 py-12">
        <p>Winkel niet gevonden.</p>
        <button onClick={() => setActivePage('stores')} className="mt-3 text-accent hover:underline">
          Terug naar winkels
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start gap-4">
        <button
          onClick={() => setActivePage('stores')}
          className="mt-1 p-1.5 rounded-lg bg-bg hover:bg-bg4 transition text-dark/50 hover:text-dark"
        >
          <ArrowLeft size={18} />
        </button>
        <div className="flex-1 min-w-0">
          <h2 className="text-lg font-semibold truncate" title={storeName}>{storeName}</h2>
          <div className="flex items-center gap-2 mt-1">
            <ChannelPill channel={first.ch} />
          </div>
        </div>
      </div>

      {/* KPI */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="Verkopen" value={totalSales.toLocaleString('nl-NL')} icon={<ShoppingCart size={16} />} />
        <StatCard label="Voorraad" value={totalStock.toLocaleString('nl-NL')} icon={<Package size={16} />} sub="meest recente week" />
        <StatCard label="Inkopen" value={totalPurchase.toLocaleString('nl-NL')} icon={<TrendingUp size={16} />} />
        <StatCard label="Artikelen" value={articleCount} icon={<Box size={16} />} />
      </div>

      {/* Trend charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-white border border-bg4 rounded-3xl shadow-sm p-4">
          <h3 className="text-sm font-medium text-dark/60 mb-3">Verkopen per week</h3>
          <ResponsiveContainer width="100%" height={250}>
            <LineChart data={weekTrend}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="week" stroke="#999" fontSize={12} />
              <YAxis stroke="#999" fontSize={12} />
              <Tooltip contentStyle={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 16, boxShadow: '0 2px 8px rgba(0,0,0,0.08)' }} />
              <Line type="monotone" dataKey="verkopen" stroke="#2563eb" strokeWidth={2} dot={{ r: 3 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-white border border-bg4 rounded-3xl shadow-sm p-4">
          <h3 className="text-sm font-medium text-dark/60 mb-3">Verkopen per merk</h3>
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={brandBreakdown}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="brand" stroke="#999" fontSize={11} />
              <YAxis stroke="#999" fontSize={12} />
              <Tooltip contentStyle={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 16, boxShadow: '0 2px 8px rgba(0,0,0,0.08)' }} />
              <Bar dataKey="sales" name="Verkopen" fill="#2563eb" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Products table */}
      <div className="bg-white border border-bg4 rounded-3xl shadow-sm p-4">
        <h3 className="text-sm font-medium text-dark/60 mb-3">Producten in deze winkel</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-dark/40 text-xs uppercase">
                <th className="pb-2 pr-3">#</th>
                <th className="pb-2 pr-3">Artikel</th>
                <th className="pb-2 pr-3">Merk</th>
                <th className="pb-2 pr-3">Productgroep</th>
                <th className="pb-2 pr-3 text-right">Verkopen</th>
                <th className="pb-2 pr-3 text-right">Voorraad</th>
                <th className="pb-2 pr-3 text-right">Inkopen</th>
                <th className="pb-2">Trend</th>
              </tr>
            </thead>
            <tbody>
              {productBreakdown.map((p, i) => (
                <tr key={p.an} className="border-t border-bg4 hover:bg-bg/50 transition">
                  <td className="py-1.5 pr-3 text-dark/40">{i + 1}</td>
                  <td className="py-1.5 pr-3">
                    <button
                      onClick={() => setActivePage('productdetail', p.an)}
                      className="text-accent hover:underline truncate max-w-[200px] block text-left"
                      title={p.an}
                    >
                      {displayName(p.an)}
                    </button>
                  </td>
                  <td className="py-1.5 pr-3 text-dark/50">{p.mfr}</td>
                  <td className="py-1.5 pr-3 text-dark/50">{p.pg}</td>
                  <td className="py-1.5 pr-3 text-right font-mono">{p.s}</td>
                  <td className="py-1.5 pr-3 text-right font-mono">{p.k}</td>
                  <td className="py-1.5 pr-3 text-right font-mono">{p.p}</td>
                  <td className="py-1.5"><Sparkline values={p.weekSales} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Per week table */}
      <div className="bg-white border border-bg4 rounded-3xl shadow-sm p-4">
        <h3 className="text-sm font-medium text-dark/60 mb-3">Per week</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-dark/40 text-xs uppercase">
                <th className="pb-2 pr-3">Week</th>
                <th className="pb-2 pr-3 text-right">Verkopen</th>
                <th className="pb-2 pr-3 text-right">Voorraad</th>
                <th className="pb-2 pr-3 text-right">Inkopen</th>
                <th className="pb-2 text-right">Artikelen</th>
              </tr>
            </thead>
            <tbody>
              {weekBreakdown.map((w) => (
                <tr key={w.w} className="border-t border-bg4">
                  <td className="py-1.5 pr-3">W{w.w.slice(-2)} ({w.w})</td>
                  <td className="py-1.5 pr-3 text-right font-mono">{w.sales}</td>
                  <td className="py-1.5 pr-3 text-right font-mono">{w.stock}</td>
                  <td className="py-1.5 pr-3 text-right font-mono">{w.purchase}</td>
                  <td className="py-1.5 text-right font-mono">{w.articles}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
