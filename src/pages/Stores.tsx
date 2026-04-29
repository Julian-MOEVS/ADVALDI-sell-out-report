import { useMemo } from 'react';
import { useAppStore } from '../store/useAppStore';
import { filtered, groupBy, stockForArticle } from '../lib/filters';
import ChannelPill from '../components/ui/ChannelPill';
import RankBadge from '../components/ui/RankBadge';

export default function Stores() {
  const { allData, selectedWeek, selectedChannel, setActivePage } = useAppStore();
  const data = allData();
  const rows = useMemo(() => filtered(data, selectedWeek, selectedChannel), [data, selectedWeek, selectedChannel]);

  const totalSales = rows.reduce((a, r) => a + r.s, 0);

  const stores = useMemo(() => {
    const g = groupBy(rows, (r) => r.sl || r.st);
    return Object.entries(g)
      .map(([store, sRows]) => {
        const sales = sRows.reduce((a, r) => a + r.s, 0);
        const stock = stockForArticle(sRows);
        const articles = new Set(sRows.map((r) => r.an)).size;
        return {
          store,
          channel: sRows[0].ch,
          sales,
          stock,
          articles,
          share: totalSales > 0 ? ((sales / totalSales) * 100).toFixed(1) : '0.0',
        };
      })
      .sort((a, b) => b.sales - a.sales);
  }, [rows, totalSales]);

  return (
    <div className="bg-white border border-bg4 rounded-3xl shadow-sm overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-dark/40 text-xs uppercase bg-bg">
              <th className="p-3">#</th>
              <th className="p-3">Winkel</th>
              <th className="p-3">Kanaal</th>
              <th className="p-3 text-right">Verkopen</th>
              <th className="p-3 text-right">Voorraad</th>
              <th className="p-3 text-right">Artikelen</th>
              <th className="p-3 text-right">Aandeel %</th>
              <th className="p-3"></th>
            </tr>
          </thead>
          <tbody>
            {stores.map((s, i) => (
              <tr key={s.store} className="border-t border-bg4 hover:bg-bg/50 transition">
                <td className="p-3 text-dark/40">{i + 1}</td>
                <td className="p-3 max-w-[220px]">
                  <button
                    onClick={() => setActivePage('storedetail', s.store)}
                    className="text-accent hover:underline truncate block text-left max-w-full"
                    title={s.store}
                  >
                    {s.store}
                  </button>
                </td>
                <td className="p-3"><ChannelPill channel={s.channel} /></td>
                <td className="p-3 text-right font-mono">{s.sales}</td>
                <td className="p-3 text-right font-mono">{s.stock}</td>
                <td className="p-3 text-right font-mono">{s.articles}</td>
                <td className="p-3 text-right font-mono">{s.share}%</td>
                <td className="p-3">{i < 3 && <RankBadge rank={i + 1} />}</td>
              </tr>
            ))}
            {stores.length === 0 && (
              <tr><td colSpan={8} className="p-8 text-center text-dark/40">Geen winkels gevonden</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
