import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
} from 'recharts';
import type { DataRow } from '../../types';
import { groupBy } from '../../lib/filters';

interface Props {
  data: DataRow[];
  displayName: (orig: string) => string;
}

export default function TopProductsChart({ data, displayName }: Props) {
  const byArticle = groupBy(data, (r) => r.an);
  const chartData = Object.entries(byArticle)
    .map(([an, rows]) => ({
      name: displayName(an).length > 30 ? displayName(an).slice(0, 27) + '...' : displayName(an),
      verkopen: rows.reduce((a, r) => a + r.s, 0),
    }))
    .sort((a, b) => b.verkopen - a.verkopen)
    .slice(0, 8);

  return (
    <ResponsiveContainer width="100%" height={300}>
      <BarChart data={chartData} layout="vertical" margin={{ top: 5, right: 20, bottom: 5, left: 10 }}>
        <XAxis type="number" stroke="#666" fontSize={12} />
        <YAxis dataKey="name" type="category" stroke="#666" fontSize={10} width={160} />
        <Tooltip
          contentStyle={{ background: '#141418', border: '1px solid #24242c', borderRadius: 8 }}
          labelStyle={{ color: '#eeeef2' }}
        />
        <Bar dataKey="verkopen" fill="#34d399" radius={[0, 4, 4, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}
