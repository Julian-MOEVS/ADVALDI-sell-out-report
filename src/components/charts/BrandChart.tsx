import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';
import type { DataRow } from '../../types';
import { groupBy } from '../../lib/filters';

interface Props {
  data: DataRow[];
}

export default function BrandChart({ data }: Props) {
  const byBrand = groupBy(data, (r) => r.mfr);
  const chartData = Object.entries(byBrand)
    .map(([brand, rows]) => ({
      brand,
      verkopen: rows.reduce((a, r) => a + r.s, 0),
    }))
    .sort((a, b) => b.verkopen - a.verkopen)
    .slice(0, 8);

  return (
    <ResponsiveContainer width="100%" height={300}>
      <BarChart data={chartData} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
        <XAxis dataKey="brand" stroke="#94a3b8" fontSize={11} />
        <YAxis stroke="#94a3b8" fontSize={12} />
        <Tooltip
          contentStyle={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 16, boxShadow: '0 4px 12px rgba(0,0,0,0.08)' }}
          labelStyle={{ color: '#1d1d1d', fontWeight: 600 }}
        />
        <Bar dataKey="verkopen" fill="#2563eb" radius={[8, 8, 0, 0]} fillOpacity={0.8} />
      </BarChart>
    </ResponsiveContainer>
  );
}
