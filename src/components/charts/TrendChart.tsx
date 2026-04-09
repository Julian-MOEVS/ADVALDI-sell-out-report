import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Area,
} from 'recharts';
import type { DataRow } from '../../types';
import { weeks, groupBy } from '../../lib/filters';

interface Props {
  data: DataRow[];
  market: 'all' | 'NL' | 'BE';
}

export default function TrendChart({ data, market }: Props) {
  const allWeeks = weeks(data);
  const byWeek = groupBy(data, (r) => r.w);

  const chartData = allWeeks.map((w) => {
    const rows = byWeek[w] || [];
    const nlRows = rows.filter((r) => r.rg === 'NL');
    const beRows = rows.filter((r) => r.rg === 'BE');
    return {
      week: `W${w.slice(-2)}`,
      NL: nlRows.reduce((a, r) => a + r.s, 0),
      BE: beRows.reduce((a, r) => a + r.s, 0),
      Totaal: rows.reduce((a, r) => a + r.s, 0),
    };
  });

  return (
    <ResponsiveContainer width="100%" height={300}>
      <LineChart data={chartData} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#24242c" />
        <XAxis dataKey="week" stroke="#666" fontSize={12} />
        <YAxis stroke="#666" fontSize={12} />
        <Tooltip
          contentStyle={{ background: '#141418', border: '1px solid #24242c', borderRadius: 8 }}
          labelStyle={{ color: '#eeeef2' }}
        />
        {market === 'all' ? (
          <>
            <Area type="monotone" dataKey="NL" fill="#3b82f6" fillOpacity={0.1} stroke="none" />
            <Area type="monotone" dataKey="BE" fill="#f59e0b" fillOpacity={0.1} stroke="none" />
            <Line type="monotone" dataKey="NL" stroke="#3b82f6" strokeWidth={2} dot={{ r: 3 }} />
            <Line type="monotone" dataKey="BE" stroke="#f59e0b" strokeWidth={2} dot={{ r: 3 }} />
          </>
        ) : (
          <>
            <Area
              type="monotone"
              dataKey="Totaal"
              fill={market === 'NL' ? '#3b82f6' : '#f59e0b'}
              fillOpacity={0.1}
              stroke="none"
            />
            <Line
              type="monotone"
              dataKey="Totaal"
              stroke={market === 'NL' ? '#3b82f6' : '#f59e0b'}
              strokeWidth={2}
              dot={{ r: 3 }}
            />
          </>
        )}
      </LineChart>
    </ResponsiveContainer>
  );
}
