import { useState, useMemo } from 'react';
import { useAppStore } from '../store/useAppStore';
import { filtered, weeks, sum, groupBy, stockForArticle } from '../lib/filters';
import { exportWeekExcel, exportBrandExcel } from '../lib/excel';
import StatCard from '../components/ui/StatCard';
import MarketPill from '../components/ui/MarketPill';
import { ShoppingCart, Package, TrendingUp, Store, Download } from 'lucide-react';

export default function WeekView() {
  const { allData, displayName, aliases } = useAppStore();
  const data = allData();
  const allWeeks = weeks(data);

  const [activeWeek, setActiveWeek] = useState(allWeeks[allWeeks.length - 1] || '');
  const [activeMarket, setActiveMarket] = useState<'all' | 'NL' | 'BE'>('all');

  const rows = useMemo(() => filtered(data, activeWeek, activeMarket), [data, activeWeek, activeMarket]);
  const hasNL = data.some((r) => r.w === activeWeek && r.rg === 'NL');
  const hasBE = data.some((r) => r.w === activeWeek && r.rg === 'BE');

  const prevWeekIdx = allWeeks.indexOf(activeWeek);
  const prevWeek = prevWeekIdx > 0 ? allWeeks[prevWeekIdx - 1] : null;
  const prevRows = useMemo(
    () => (prevWeek ? filtered(data, prevWeek, activeMarket) : []),
    [data, prevWeek, activeMarket]
  );

  const totalSales = sum(rows, 's');
  const prevSales = sum(prevRows, 's');
  const deltaSales = prevWeek ? totalSales - prevSales : null;
  const totalStock = rows.reduce((a, r) => a + r.k, 0);
  const totalPurchase = sum(rows, 'p');
  const activeStores = new Set(rows.map((r) => r.sl || r.st)).size;

  // Top products
  const topProducts = useMemo(() => {
    const g = groupBy(rows, (r) => r.an);
    const prevG = groupBy(prevRows, (r) => r.an);
    return Object.entries(g)
      .map(([an, aRows]) => {
        const s = aRows.reduce((a, r) => a + r.s, 0);
        const k = aRows.reduce((a, r) => a + r.k, 0);
        const pS = prevG[an] ? prevG[an].reduce((a, r) => a + r.s, 0) : null;
        return { an, mfr: aRows[0].mfr, s, k, delta: pS !== null ? s - pS : null };
      })
      .sort((a, b) => b.s - a.s);
  }, [rows, prevRows]);

  // Top stores
  const topStores = useMemo(() => {
    const g = groupBy(rows, (r) => r.sl || r.st);
    return Object.entries(g)
      .map(([store, sRows]) => ({
        store,
        market: sRows[0].rg,
        sales: sRows.reduce((a, r) => a + r.s, 0),
      }))
      .sort((a, b) => b.sales - a.sales);
  }, [rows]);

  // Brand breakdown
  const brandGroups = useMemo(() => {
    const g = groupBy(rows, (r) => r.mfr);
    return Object.entries(g)
      .map(([brand, bRows]) => {
        const sales = bRows.reduce((a, r) => a + r.s, 0);
        const stock = stockForArticle(bRows);
        const articles = groupBy(bRows, (r) => r.an);
        const withSales = Object.entries(articles).filter(([, ar]) => ar.reduce((a, r) => a + r.s, 0) > 0);
        const withoutSales = Object.entries(articles).length - withSales.length;
        return { brand, rows: bRows, sales, stock, articles, withSales, withoutSales, market: bRows[0].rg };
      })
      .sort((a, b) => b.sales - a.sales);
  }, [rows]);

  const marketLabel = activeMarket === 'all' ? 'NL+BE' : activeMarket === 'NL' ? 'NL' : 'BE/LU';

  if (allWeeks.length === 0) {
    return <div className="text-center text-dark/40 py-12">Geen data beschikbaar. Importeer eerst Excel-bestanden.</div>;
  }

  return (
    <div className="space-y-6">
      {/* Week tabs */}
      <div className="flex flex-wrap gap-2">
        {allWeeks.map((w) => (
          <button
            key={w}
            onClick={() => setActiveWeek(w)}
            className={`px-3 py-1.5 rounded-lg text-sm transition ${
              w === activeWeek ? 'bg-gradient-to-r from-accent-light to-accent text-white' : 'bg-bg text-dark/50 hover:text-dark'
            }`}
          >
            W{w.slice(-2)}
          </button>
        ))}
      </div>

      {/* Market filter */}
      <div className="flex gap-2 items-center">
        {(['all', 'NL', 'BE'] as const).map((m) => {
          const disabled = (m === 'NL' && !hasNL) || (m === 'BE' && !hasBE);
          return (
            <button
              key={m}
              onClick={() => !disabled && setActiveMarket(m)}
              disabled={disabled}
              className={`px-3 py-1.5 rounded-lg text-sm transition ${
                m === activeMarket ? 'bg-gradient-to-r from-accent-light to-accent text-white' : disabled ? 'bg-bg text-dark/30 cursor-not-allowed' : 'bg-bg text-dark/50 hover:text-dark'
              }`}
            >
              {m === 'all' ? 'NL + BE' : m === 'NL' ? 'NL' : 'BE/LU'}
            </button>
          );
        })}
        <div className="ml-4 flex gap-2 text-xs">
          <span className={hasNL ? 'text-nl-blue' : 'text-nl-blue/30'}>NL data {hasNL ? '✓' : '—'}</span>
          <span className={hasBE ? 'text-be-amber' : 'text-be-amber/30'}>BE/LU data {hasBE ? '✓' : '—'}</span>
        </div>
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
            <button
              onClick={() => exportWeekExcel(activeWeek, marketLabel, rows, prevRows, aliases)}
              className="flex items-center gap-1 text-xs text-accent hover:text-accent/80"
            >
              <Download size={14} /> Excel
            </button>
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
                  <tr key={p.an} className="border-t border-bg4">
                    <td className="py-1.5 pr-2 text-dark/40">{i + 1}</td>
                    <td className="py-1.5 pr-2 truncate max-w-[180px]" title={p.an}>{displayName(p.an)}</td>
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
                  <th className="pb-2 pr-2">Markt</th>
                  <th className="pb-2 text-right">Verkopen</th>
                </tr>
              </thead>
              <tbody>
                {topStores.slice(0, 20).map((s, i) => (
                  <tr key={s.store} className="border-t border-bg4">
                    <td className="py-1.5 pr-2 text-dark/40">{i + 1}</td>
                    <td className="py-1.5 pr-2 truncate max-w-[180px]" title={s.store}>{s.store}</td>
                    <td className="py-1.5 pr-2"><MarketPill market={s.market} /></td>
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
            onClick={() => exportBrandExcel(activeWeek, marketLabel, rows, aliases)}
            className="flex items-center gap-1 text-xs text-accent hover:text-accent/80"
          >
            <Download size={14} /> Excel per merk
          </button>
        </div>
        {brandGroups.map((bg) => (
          <details key={bg.brand} open={bg.sales > 0} className="mb-2">
            <summary className="cursor-pointer flex items-center gap-2 py-2 px-3 bg-bg rounded-lg hover:bg-bg4 transition">
              <MarketPill market={bg.market} />
              <span className="font-medium">{bg.brand}</span>
              <span className="ml-auto flex gap-2">
                <span className="text-xs px-2 py-0.5 bg-accent/20 text-accent rounded">{bg.sales} verkopen</span>
                <span className="text-xs px-2 py-0.5 bg-info/20 text-info rounded">{bg.stock} voorraad</span>
                <span className="text-xs text-dark/40">{Object.keys(bg.articles).length} artikel(en)</span>
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
                  {bg.withSales.map(([an, ar]) => (
                    <tr key={an} className="border-t border-bg4">
                      <td className="py-1 pr-2 truncate max-w-[240px]" title={an}>{displayName(an)}</td>
                      <td className="py-1 pr-2 text-right font-mono">{ar.reduce((a, r) => a + r.s, 0)}</td>
                      <td className="py-1 text-right font-mono">{ar.reduce((a, r) => a + r.k, 0)}</td>
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
