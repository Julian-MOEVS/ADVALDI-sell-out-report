import { useState, useMemo } from 'react';
import { useAppStore } from '../store/useAppStore';
import { filtered, weeks, sum, groupBy, stockForArticle, resolveProductKey, resolvedDisplayName, resolveStoreKey, channels } from '../lib/filters';
import { exportWeekExcel } from '../lib/excel';
import StatCard from '../components/ui/StatCard';
import ChannelPill from '../components/ui/ChannelPill';
import { ShoppingCart, Package, TrendingUp, Store, Download, Calendar } from 'lucide-react';

const NL_MONTHS = ['jan', 'feb', 'mrt', 'apr', 'mei', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec'];

function isoWeekMonday(week: string): Date | null {
  if (!/^\d{6}$/.test(week)) return null;
  const year = parseInt(week.slice(0, 4));
  const wk = parseInt(week.slice(4, 6));
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const jan4Day = jan4.getUTCDay() || 7;
  const monday = new Date(jan4);
  monday.setUTCDate(jan4.getUTCDate() - (jan4Day - 1) + (wk - 1) * 7);
  return monday;
}

function formatWeekRange(week: string): string {
  const mon = isoWeekMonday(week);
  if (!mon) return '';
  const sun = new Date(mon);
  sun.setUTCDate(mon.getUTCDate() + 6);
  const dM = mon.getUTCDate();
  const dS = sun.getUTCDate();
  const mM = NL_MONTHS[mon.getUTCMonth()];
  const mS = NL_MONTHS[sun.getUTCMonth()];
  const yM = mon.getUTCFullYear();
  const yS = sun.getUTCFullYear();
  if (yM !== yS) return `${dM} ${mM} ${yM} – ${dS} ${mS} ${yS}`;
  if (mM !== mS) return `${dM} ${mM} – ${dS} ${mS} ${yM}`;
  return `${dM} – ${dS} ${mM} ${yM}`;
}

export default function WeekView() {
  const { allData, aliases } = useAppStore();
  const data = allData();
  const allWeeks = weeks(data);

  const [activeWeek, setActiveWeek] = useState(allWeeks[allWeeks.length - 1] || '');
  const [activeChannel, setActiveChannel] = useState<'all' | string>('all');

  const rows = useMemo(() => filtered(data, activeWeek, activeChannel), [data, activeWeek, activeChannel]);
  const weekChannels = useMemo(() => channels(data.filter((r) => r.w === activeWeek)), [data, activeWeek]);

  const prevWeekIdx = allWeeks.indexOf(activeWeek);
  const prevWeek = prevWeekIdx > 0 ? allWeeks[prevWeekIdx - 1] : null;
  const prevRows = useMemo(
    () => (prevWeek ? filtered(data, prevWeek, activeChannel) : []),
    [data, prevWeek, activeChannel]
  );

  const totalSales = sum(rows, 's');
  const prevSales = sum(prevRows, 's');
  const deltaSales = prevWeek ? totalSales - prevSales : null;
  const totalStock = rows.reduce((a, r) => a + r.k, 0);
  const totalPurchase = sum(rows, 'p');
  const activeStores = new Set(rows.map((r) => resolveStoreKey(r))).size;

  // Top products — grouped by resolved catalog key
  const topProducts = useMemo(() => {
    const g = groupBy(rows, resolveProductKey);
    const prevG = groupBy(prevRows, resolveProductKey);
    return Object.entries(g)
      .map(([key, aRows]) => {
        const s = aRows.reduce((a, r) => a + r.s, 0);
        const k = aRows.reduce((a, r) => a + r.k, 0);
        const pS = prevG[key] ? prevG[key].reduce((a, r) => a + r.s, 0) : null;
        const name = resolvedDisplayName(key, aliases);
        const mfr = aRows[0].mfr;
        return { key, name, mfr, s, k, delta: pS !== null ? s - pS : null };
      })
      .sort((a, b) => b.s - a.s);
  }, [rows, prevRows, aliases]);

  // Top stores — Shopify/Brincr grouped by channel
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

  // Brand breakdown — with resolved product names. Groep case/whitespace-insensitief op merk
  // zodat 'Pure Electric' / 'PURE ELECTRIC' / ' Pure Electric ' in één blok belanden.
  const brandGroups = useMemo(() => {
    const g = groupBy(rows, (r) => (r.mfr || '').trim().toLowerCase());
    return Object.entries(g)
      .map(([, bRows]) => {
        // Gebruik meest-voorkomende casing als display
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
          stock: ar.reduce((a, r) => a + r.k, 0),
        }));
        const withSales = articleEntries.filter((a) => a.sales > 0);
        const withoutSales = articleEntries.length - withSales.length;
        return { brand, sales, stock, articleEntries: withSales, withoutSales, channel: bRows[0].ch };
      })
      .sort((a, b) => b.sales - a.sales);
  }, [rows, aliases]);

  const channelLabel = activeChannel === 'all' ? 'Alle kanalen' : activeChannel;

  const weekDateRange = useMemo(() => formatWeekRange(activeWeek), [activeWeek]);

  if (allWeeks.length === 0) {
    return <div className="text-center text-dark/40 py-12">Geen data beschikbaar. Importeer eerst Excel-bestanden.</div>;
  }

  return (
    <div className="space-y-6">
      {/* Week tabs */}
      <div className="flex flex-wrap gap-2">
        {allWeeks.map((w) => {
          const range = formatWeekRange(w);
          return (
            <button
              key={w}
              onClick={() => setActiveWeek(w)}
              title={range}
              className={`flex flex-col items-start px-3 py-1.5 rounded-lg text-sm transition leading-tight ${
                w === activeWeek ? 'bg-gradient-to-r from-accent-light to-accent text-white' : 'bg-bg text-dark/50 hover:text-dark'
              }`}
            >
              <span>W{w.slice(-2)}</span>
              {range && (
                <span className={`text-[10px] ${w === activeWeek ? 'text-white/80' : 'text-dark/40'}`}>{range}</span>
              )}
            </button>
          );
        })}
      </div>

      {/* Active week date header */}
      {weekDateRange && (
        <div className="flex items-center gap-2 text-sm text-dark/60">
          <Calendar size={14} className="text-accent" />
          <span>
            Week <strong className="text-dark">{parseInt(activeWeek.slice(-2))}</strong> · {weekDateRange}
          </span>
        </div>
      )}

      {/* Channel filter */}
      <div className="flex gap-2 items-center flex-wrap">
        <button
          onClick={() => setActiveChannel('all')}
          className={`px-3 py-1.5 rounded-lg text-sm transition ${
            activeChannel === 'all' ? 'bg-gradient-to-r from-accent-light to-accent text-white' : 'bg-bg text-dark/50 hover:text-dark'
          }`}
        >
          Alle kanalen
        </button>
        {weekChannels.map((ch) => (
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
              {deltaSales >= 0 ? '▲' : '▼'} {Math.abs(deltaSales)} vs vorige week
            </span>
          )}
        />
        <StatCard label="Voorraad einde week" value={totalStock.toLocaleString('nl-NL')} icon={<Package size={16} />} />
        <StatCard label="Inkopen" value={totalPurchase.toLocaleString('nl-NL')} icon={<TrendingUp size={16} />} />
        <StatCard label="Actieve winkels" value={activeStores} icon={<Store size={16} />} />
      </div>

      {/* Two columns */}
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

      {/* Brand breakdown */}
      <div className="bg-white border border-bg4 rounded-3xl shadow-sm p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-medium text-dark/60">Merk-breakdown</h3>
          <button
            onClick={() => exportWeekExcel(activeWeek, channelLabel, rows, prevRows, aliases)}
            className="flex items-center gap-1 text-xs text-accent hover:text-accent/80"
            title="Exporteert één Excel-bestand in Pure x ADVALDI format met per merk een tabblad"
          >
            <Download size={14} /> Export Sell Out Report
          </button>
        </div>
        {brandGroups.map((bg) => (
          <details key={bg.brand} open={bg.sales > 0} className="mb-2">
            <summary className="cursor-pointer flex items-center gap-2 py-2 px-3 bg-bg rounded-lg hover:bg-bg4 transition">
              <ChannelPill channel={bg.channel} />
              <span className="font-medium">{bg.brand}</span>
              <span className="ml-auto flex gap-2">
                <span className="text-xs px-2 py-0.5 bg-accent/20 text-accent rounded">{bg.sales} verkopen</span>
                <span className="text-xs px-2 py-0.5 bg-info/20 text-info rounded">{bg.stock} voorraad</span>
                <span className="text-xs text-dark/40">{bg.articleEntries.length + bg.withoutSales} artikel(en)</span>
              </span>
            </summary>
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
