import { useState, useMemo } from 'react';
import { useAppStore } from '../store/useAppStore';
import {
  filteredMonth, months, monthLabel, monthLabelShort, weekToMonth,
  sum, groupBy, stockForArticle, stockForData,
  resolveProductKey, resolvedDisplayName, resolveStoreKey, channels,
} from '../lib/filters';
import { exportMonthTotalExcel } from '../lib/excel';
import StatCard from '../components/ui/StatCard';
import ChannelPill from '../components/ui/ChannelPill';
import { ShoppingCart, Package, TrendingUp, Store, Download, Calendar } from 'lucide-react';

export default function MonthView() {
  const { allData, aliases } = useAppStore();
  const data = allData();
  const allMonths = months(data);

  const [activeMonth, setActiveMonth] = useState(allMonths[allMonths.length - 1] || '');
  const [activeChannel, setActiveChannel] = useState<'all' | string>('all');

  const rows = useMemo(() => filteredMonth(data, activeMonth, activeChannel), [data, activeMonth, activeChannel]);
  const monthChannels = useMemo(
    () => channels(data.filter((r) => weekToMonth(r.w) === activeMonth)),
    [data, activeMonth]
  );

  const prevMonthIdx = allMonths.indexOf(activeMonth);
  const prevMonth = prevMonthIdx > 0 ? allMonths[prevMonthIdx - 1] : null;
  const prevRows = useMemo(
    () => (prevMonth ? filteredMonth(data, prevMonth, activeChannel) : []),
    [data, prevMonth, activeChannel]
  );

  const totalSales = sum(rows, 's');
  const prevSales = sum(prevRows, 's');
  const deltaSales = prevMonth ? totalSales - prevSales : null;
  // Voorraad = snapshot van de laatste week binnen de maand (niet optellen over weken).
  const totalStock = stockForData(rows, 'all');
  const totalPurchase = sum(rows, 'p');
  const activeStores = new Set(rows.map((r) => resolveStoreKey(r))).size;

  // Top producten — gegroepeerd per resolved catalogussleutel
  const topProducts = useMemo(() => {
    const g = groupBy(rows, resolveProductKey);
    const prevG = groupBy(prevRows, resolveProductKey);
    return Object.entries(g)
      .map(([key, aRows]) => {
        const s = aRows.reduce((a, r) => a + r.s, 0);
        const k = stockForArticle(aRows);
        const pS = prevG[key] ? prevG[key].reduce((a, r) => a + r.s, 0) : null;
        const name = resolvedDisplayName(key, aliases);
        const mfr = aRows[0].mfr;
        return { key, name, mfr, s, k, delta: pS !== null ? s - pS : null };
      })
      .sort((a, b) => b.s - a.s);
  }, [rows, prevRows, aliases]);

  // Top winkels — Shopify/Brincr gegroepeerd per kanaal
  const topStores = useMemo(() => {
    const g = groupBy(rows, resolveStoreKey);
    return Object.entries(g)
      .map(([store, sRows]) => ({
        store,
        channel: sRows[0].ch,
        sales: sRows.reduce((a, r) => a + r.s, 0),
      }))
      .sort((a, b) => b.sales - a.sales);
  }, [rows]);

  // Merk-breakdown — case/whitespace-insensitief op merk gegroepeerd
  const brandGroups = useMemo(() => {
    const g = groupBy(rows, (r) => (r.mfr || '').trim().toLowerCase());
    return Object.entries(g)
      .map(([, bRows]) => {
        const labelCounts: Record<string, number> = {};
        for (const r of bRows) {
          const label = (r.mfr || '').trim() || 'Onbekend merk';
          labelCounts[label] = (labelCounts[label] || 0) + 1;
        }
        const brand = Object.entries(labelCounts).sort((a, b) => b[1] - a[1])[0][0];

        const sales = bRows.reduce((a, r) => a + r.s, 0);
        const stock = stockForArticle(bRows);
        const articles = groupBy(bRows, resolveProductKey);
        const articleEntries = Object.entries(articles).map(([key, ar]) => ({
          key,
          name: resolvedDisplayName(key, aliases),
          sales: ar.reduce((a, r) => a + r.s, 0),
          stock: stockForArticle(ar),
        }));
        const withSales = articleEntries.filter((a) => a.sales > 0);
        const withoutSales = articleEntries.length - withSales.length;
        // Verkopen per kanaal, zodat een multi-channel merk tegen de losse
        // bronbestanden (MM / FNAC / Shopify / Vanden Borre) te leggen is.
        const channelBreakdown = Object.entries(groupBy(bRows, (r) => r.ch || '—'))
          .map(([ch, cRows]) => ({ ch, sales: cRows.reduce((a, r) => a + r.s, 0) }))
          .filter((c) => c.sales !== 0)
          .sort((a, b) => b.sales - a.sales);
        return { brand, sales, stock, articleEntries: withSales, withoutSales, channelBreakdown };
      })
      .sort((a, b) => b.sales - a.sales);
  }, [rows, aliases]);

  const channelLabel = activeChannel === 'all' ? 'Alle kanalen' : activeChannel;

  if (allMonths.length === 0) {
    return <div className="text-center text-dark/40 py-12">Geen data beschikbaar. Importeer eerst Excel-bestanden.</div>;
  }

  return (
    <div className="space-y-6">
      {/* Maand-tabs */}
      <div className="flex flex-wrap gap-2">
        {allMonths.map((m) => (
          <button
            key={m}
            onClick={() => setActiveMonth(m)}
            title={monthLabel(m)}
            className={`px-3 py-1.5 rounded-lg text-sm transition ${
              m === activeMonth ? 'bg-gradient-to-r from-accent-light to-accent text-white' : 'bg-bg text-dark/50 hover:text-dark'
            }`}
          >
            {monthLabelShort(m)}
          </button>
        ))}
      </div>

      {/* Actieve maand-header */}
      {activeMonth && (
        <div className="flex items-center gap-2 text-sm text-dark/60">
          <Calendar size={14} className="text-accent" />
          <span>Maand · <strong className="text-dark">{monthLabel(activeMonth)}</strong></span>
        </div>
      )}

      {/* Kanaalfilter */}
      <div className="flex gap-2 items-center flex-wrap">
        <button
          onClick={() => setActiveChannel('all')}
          className={`px-3 py-1.5 rounded-lg text-sm transition ${
            activeChannel === 'all' ? 'bg-gradient-to-r from-accent-light to-accent text-white' : 'bg-bg text-dark/50 hover:text-dark'
          }`}
        >
          Alle kanalen
        </button>
        {monthChannels.map((ch) => (
          <button
            key={ch}
            onClick={() => setActiveChannel(ch)}
            className={`px-3 py-1.5 rounded-lg text-sm transition ${
              ch === activeChannel ? 'bg-gradient-to-r from-accent-light to-accent text-white' : 'bg-bg text-dark/50 hover:text-dark'
            }`}
          >
            {ch}
          </button>
        ))}
      </div>

      {/* KPI */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard
          label="Verkopen"
          value={totalSales.toLocaleString('nl-NL')}
          icon={<ShoppingCart size={16} />}
          sub={deltaSales !== null && (
            <span className={deltaSales >= 0 ? 'text-success' : 'text-danger'}>
              {deltaSales >= 0 ? '▲' : '▼'} {Math.abs(deltaSales)} vs vorige maand
            </span>
          )}
        />
        <StatCard label="Voorraad einde maand" value={totalStock.toLocaleString('nl-NL')} icon={<Package size={16} />} />
        <StatCard label="Inkopen" value={totalPurchase.toLocaleString('nl-NL')} icon={<TrendingUp size={16} />} />
        <StatCard label="Actieve winkels" value={activeStores} icon={<Store size={16} />} />
      </div>

      {/* Twee kolommen */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-white border border-bg4 rounded-3xl shadow-sm p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-medium text-dark/60">Top producten</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-dark/40 text-xs uppercase">
                  <th className="pb-2 pr-2">#</th>
                  <th className="pb-2 pr-2">Artikel</th>
                  <th className="pb-2 pr-2">Merk</th>
                  <th className="pb-2 pr-2 text-right">Verkopen</th>
                  <th className="pb-2 pr-2 text-right">Delta</th>
                  <th className="pb-2 text-right">Voorraad</th>
                </tr>
              </thead>
              <tbody>
                {topProducts.slice(0, 20).map((p, i) => (
                  <tr key={p.key} className="border-t border-bg4">
                    <td className="py-1.5 pr-2 text-dark/40">{i + 1}</td>
                    <td className="py-1.5 pr-2 truncate max-w-[180px]" title={p.name}>{p.name}</td>
                    <td className="py-1.5 pr-2 text-dark/50">{p.mfr}</td>
                    <td className="py-1.5 pr-2 text-right font-mono">{p.s}</td>
                    <td className="py-1.5 pr-2 text-right font-mono">
                      {p.delta !== null ? (
                        <span className={p.delta > 0 ? 'text-success' : p.delta < 0 ? 'text-danger' : 'text-dark/40'}>
                          {p.delta > 0 ? '▲' : p.delta < 0 ? '▼' : '—'}{p.delta !== 0 ? Math.abs(p.delta) : ''}
                        </span>
                      ) : <span className="text-dark/30">—</span>}
                    </td>
                    <td className="py-1.5 text-right font-mono">{p.k}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="bg-white border border-bg4 rounded-3xl shadow-sm p-4">
          <h3 className="text-sm font-medium text-dark/60 mb-3">Top winkels</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-dark/40 text-xs uppercase">
                  <th className="pb-2 pr-2">#</th>
                  <th className="pb-2 pr-2">Winkel</th>
                  <th className="pb-2 pr-2">Kanaal</th>
                  <th className="pb-2 text-right">Verkopen</th>
                </tr>
              </thead>
              <tbody>
                {topStores.slice(0, 20).map((s, i) => (
                  <tr key={s.store} className="border-t border-bg4">
                    <td className="py-1.5 pr-2 text-dark/40">{i + 1}</td>
                    <td className="py-1.5 pr-2 truncate max-w-[180px]" title={s.store}>{s.store}</td>
                    <td className="py-1.5 pr-2"><ChannelPill channel={s.channel} /></td>
                    <td className="py-1.5 text-right font-mono">{s.sales}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Merk-breakdown */}
      <div className="bg-white border border-bg4 rounded-3xl shadow-sm p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-medium text-dark/60">Merk-breakdown</h3>
          <button
            onClick={() => exportMonthTotalExcel(activeMonth, channelLabel, rows, aliases)}
            className="flex items-center gap-1 text-xs text-accent hover:text-accent/80"
            title="Exporteert één Excel-tabblad met per product het totaal verkochte aantal (winkels/verkopers opgeteld) voor de gekozen maand"
          >
            <Download size={14} /> Export SOA totaaloverzicht
          </button>
        </div>
        {brandGroups.map((bg) => (
          <details key={bg.brand} open={bg.sales > 0} className="mb-2">
            <summary className="cursor-pointer flex items-center gap-2 py-2 px-3 bg-bg rounded-lg hover:bg-bg4 transition">
              <span className="font-medium">{bg.brand}</span>
            </summary>
            {bg.channelBreakdown.length > 0 && (
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1 ml-4 text-xs">
                <span className="uppercase tracking-wide text-dark/40">Per kanaal:</span>
                {bg.channelBreakdown.map((c) => (
                  <span key={c.ch} className="inline-flex items-center gap-1">
                    <ChannelPill channel={c.ch} /><span className="font-mono text-dark">{c.sales}</span>
                  </span>
                ))}
                <span className="ml-auto font-mono text-dark/60">Totaal {bg.sales}</span>
              </div>
            )}
            <div className="mt-1 ml-4 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-dark/40 text-xs uppercase">
                    <th className="pb-1 pr-2">Artikel</th>
                    <th className="pb-1 pr-2 text-right">Verkopen</th>
                    <th className="pb-1 text-right">Voorraad</th>
                  </tr>
                </thead>
                <tbody>
                  {bg.articleEntries.map((a) => (
                    <tr key={a.key} className="border-t border-bg4">
                      <td className="py-1 pr-2 truncate max-w-[240px]" title={a.name}>{a.name}</td>
                      <td className="py-1 pr-2 text-right font-mono">{a.sales}</td>
                      <td className="py-1 text-right font-mono">{a.stock}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {bg.withoutSales > 0 && (
                <p className="text-xs text-dark/40 mt-1 py-1">{bg.withoutSales} artikel(en) met alleen voorraad</p>
              )}
            </div>
          </details>
        ))}
      </div>
    </div>
  );
}
