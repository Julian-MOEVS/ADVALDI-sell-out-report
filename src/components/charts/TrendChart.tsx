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
        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
        <XAxis dataKey="week" stroke="#94a3b8" fontSize={12} />
        <YAxis stroke="#94a3b8" fontSize={12} />
        <Tooltip
          contentStyle={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 16, boxShadow: '0 4px 12px rgba(0,0,0,0.08)' }}
          labelStyle={{ color: '#1d1d1d', fontWeight: 600 }}
        />
        {market === 'all' ? (
          <>
            <Area type="monotone" dataKey="NL" fill="#2563eb" fillOpacity={0.08} stroke="none" />
            <Area type="monotone" dataKey="BE" fill="#d97706" fillOpacity={0.08} stroke="none" />
            <Line type="monotone" dataKey="NL" stroke="#2563eb" strokeWidth={2.5} dot={{ r: 3 }} />
            <Line type="monotone" dataKey="BE" stroke="#d97706" strokeWidth={2.5} dot={{ r: 3 }} />
          </>
        ) : (
          <>
            <Area
              type="monotone"
              dataKey="Totaal"
              fill={market === 'NL' ? '#2563eb' : '#d97706'}
              fillOpacity={0.08}
              stroke="none"
            />
            <Line
              type="monotone"
              dataKey="Totaal"
              stroke={market === 'NL' ? '#2563eb' : '#d97706'}
              strokeWidth={2.5}
              dot={{ r: 3 }}
            />
          </>
        )}
      </LineChart>
    </ResponsiveContainer>
  );
}
