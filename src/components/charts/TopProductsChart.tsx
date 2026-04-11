import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
} from 'recharts';
import type { DataRow } from '../../types';
import { groupBy, resolveProductKey, resolvedDisplayName } from '../../lib/filters';

interface Props {
  data: DataRow[];
  displayName: (orig: string) => string;
}

export default function TopProductsChart({ data }: Props) {
  const byProduct = groupBy(data, resolveProductKey);
  const chartData = Object.entries(byProduct)
    .map(([key, rows]) => {
      const name = resolvedDisplayName(key, {});
      return {
        name: name.length > 30 ? name.slice(0, 27) + '...' : name,
        verkopen: rows.reduce((a, r) => a + r.s, 0),
      };
    })
    .sort((a, b) => b.verkopen - a.verkopen)
    .slice(0, 8);

  return (
    <ResponsiveContainer width="100%" height={300}>
      <BarChart data={chartData} layout="vertical" margin={{ top: 5, right: 20, bottom: 5, left: 10 }}>
        <XAxis type="number" stroke="#94a3b8" fontSize={12} />
        <YAxis dataKey="name" type="category" stroke="#94a3b8" fontSize={10} width={160} />
        <Tooltip
          contentStyle={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 16, boxShadow: '0 4px 12px rgba(0,0,0,0.08)' }}
          labelStyle={{ color: '#1d1d1d', fontWeight: 600 }}
        />
        <Bar dataKey="verkopen" fill="#16a34a" radius={[0, 8, 8, 0]} fillOpacity={0.8} />
      </BarChart>
    </ResponsiveContainer>
  );
}
