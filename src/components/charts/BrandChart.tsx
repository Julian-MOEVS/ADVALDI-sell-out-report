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
        <CartesianGrid strokeDasharray="3 3" stroke="#24242c" />
        <XAxis dataKey="brand" stroke="#666" fontSize={11} />
        <YAxis stroke="#666" fontSize={12} />
        <Tooltip
          contentStyle={{ background: '#141418', border: '1px solid #24242c', borderRadius: 8 }}
          labelStyle={{ color: '#eeeef2' }}
        />
        <Bar dataKey="verkopen" fill="#7c6af7" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}
