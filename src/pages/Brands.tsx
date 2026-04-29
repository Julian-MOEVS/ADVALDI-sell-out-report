import { useMemo } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts';
import { useAppStore } from '../store/useAppStore';
import { filtered, weeks, groupBy, stockForArticle } from '../lib/filters';
import RankBadge from '../components/ui/RankBadge';

export default function Brands() {
  const { allData, selectedWeek, selectedChannel } = useAppStore();
  const data = allData();
  const rows = useMemo(() => filtered(data, selectedWeek, selectedChannel), [data, selectedWeek, selectedChannel]);

  const allWeeks = weeks(rows);

  // Stacked chart data
  const brands = useMemo(() => {
    const g = groupBy(rows, (r) => r.mfr);
    return Object.entries(g)
      .map(([brand, bRows]) => ({
        brand,
        sales: bRows.reduce((a, r) => a + r.s, 0),
      }))
      .sort((a, b) => b.sales - a.sales)
      .slice(0, 8)
      .map((b) => b.brand);
  }, [rows]);

  const chartData = useMemo(() => {
    return allWeeks.map((w) => {
      const weekRows = rows.filter((r) => r.w === w);
      const entry: Record<string, string | number> = { week: `W${w.slice(-2)}` };
      for (const brand of brands) {
        const bRows = weekRows.filter((r) => r.mfr === brand);
        entry[brand] = bRows.reduce((a, r) => a + r.s, 0);
      }
      return entry;
    });
  }, [allWeeks, rows, brands]);

  const colors = ['#7c6af7', '#3b82f6', '#34d399', '#f59e0b', '#f87171', '#60a5fa', '#a78bfa', '#fb923c'];

  // Brand table
  const brandTable = useMemo(() => {
    const g = groupBy(rows, (r) => r.mfr);
    return Object.entries(g)
      .map(([brand, bRows]) => ({
        brand,
        sales: bRows.reduce((a, r) => a + r.s, 0),
        stock: stockForArticle(bRows),
      }))
      .sort((a, b) => b.sales - a.sales);
  }, [rows]);

  return (
    <div className="space-y-6">
      <div className="bg-white border border-bg4 rounded-3xl shadow-sm p-4">
        <h3 className="text-sm font-medium text-dark/60 mb-3">Verkopen per merk per week (gestapeld)</h3>
        <ResponsiveContainer width="100%" height={350}>
          <BarChart data={chartData} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis dataKey="week" stroke="#999" fontSize={12} />
            <YAxis stroke="#999" fontSize={12} />
            <Tooltip
              contentStyle={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 16, boxShadow: '0 2px 8px rgba(0,0,0,0.08)' }}
              labelStyle={{ color: '#1d1d1d' }}
            />
            <Legend />
            {brands.map((brand, i) => (
              <Bar
                key={brand}
                dataKey={brand}
                name={brand}
                fill={colors[i % colors.length]}
                radius={[2, 2, 0, 0]}
              />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="bg-white border border-bg4 rounded-3xl shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-dark/40 text-xs uppercase bg-bg">
                <th className="p-3">#</th>
                <th className="p-3">Merk</th>
                <th className="p-3 text-right">Verkopen</th>
                <th className="p-3 text-right">Voorraad (recent)</th>
                <th className="p-3"></th>
              </tr>
            </thead>
            <tbody>
              {brandTable.map((b, i) => (
                <tr key={b.brand} className="border-t border-bg4 hover:bg-bg/50 transition">
                  <td className="p-3 text-dark/40">{i + 1}</td>
                  <td className="p-3 font-medium">{b.brand}</td>
                  <td className="p-3 text-right font-mono">{b.sales}</td>
                  <td className="p-3 text-right font-mono">{b.stock}</td>
                  <td className="p-3">{i < 3 && <RankBadge rank={i + 1} />}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
