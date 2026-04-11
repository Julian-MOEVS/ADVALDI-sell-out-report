import { useMemo } from 'react';
import { useAppStore } from '../store/useAppStore';
import { filtered, weeks, sum, stockForData, groupBy, resolveProductKey, resolvedDisplayName, resolveStoreKey } from '../lib/filters';
import StatCard from '../components/ui/StatCard';
import MarketPill from '../components/ui/MarketPill';
import RankBadge from '../components/ui/RankBadge';
import TrendChart from '../components/charts/TrendChart';
import BrandChart from '../components/charts/BrandChart';
import TopProductsChart from '../components/charts/TopProductsChart';
import { ShoppingCart, Package, TrendingUp, Box, Store, Calendar } from 'lucide-react';

export default function Dashboard() {
  const { allData, selectedWeek, selectedMarket, displayName, aliases, setActivePage } = useAppStore();
  const data = allData();
  const rows = useMemo(() => filtered(data, selectedWeek, selectedMarket), [data, selectedWeek, selectedMarket]);

  const allWeeks = weeks(data);
  const totalSales = sum(rows, 's');
  const totalStock = stockForData(rows, selectedWeek);
  const totalPurchase = sum(rows, 'p');
  const uniqueProducts = new Set(rows.map(resolveProductKey)).size;
  const uniqueStores = new Set(rows.map(resolveStoreKey)).size;
  const weekCount = weeks(rows).length;

  // Delta calc
  let deltaPercent: string | null = null;
  if (selectedWeek !== 'all') {
    const idx = allWeeks.indexOf(selectedWeek);
    if (idx > 0) {
      const prevWeek = allWeeks[idx - 1];
      const prevRows = filtered(data, prevWeek, selectedMarket);
      const prevSales = sum(prevRows, 's');
      if (prevSales > 0) {
        const pct = ((totalSales - prevSales) / prevSales) * 100;
        deltaPercent = (pct >= 0 ? '+' : '') + pct.toFixed(1) + '%';
      }
    }
  }

  // Top stores — grouped by resolved store key
  const storeGroups = useMemo(() => {
    const g = groupBy(rows, resolveStoreKey);
    return Object.entries(g)
      .map(([store, sRows]) => ({
        store,
        market: sRows[0].rg,
        sales: sRows.reduce((a, r) => a + r.s, 0),
      }))
      .sort((a, b) => b.sales - a.sales)
      .slice(0, 10);
  }, [rows]);

  // Low stock — grouped by resolved product key
  const lowStock = useMemo(() => {
    const g = groupBy(rows, resolveProductKey);
    return Object.entries(g)
      .map(([key, aRows]) => {
        const wks = [...new Set(aRows.map((r) => r.w))].sort();
        const last = wks[wks.length - 1];
        const stock = last ? aRows.filter((r) => r.w === last).reduce((s, r) => s + r.k, 0) : 0;
        const name = resolvedDisplayName(key, aliases);
        const mfr = aRows[0].mfr;
        return { key, name, mfr, stock };
      })
      .filter((a) => a.stock < 3)
      .sort((a, b) => a.stock - b.stock)
      .slice(0, 10);
  }, [rows, aliases]);

  if (data.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4 p-8">
        <Package className="w-16 h-16 text-dark/30" />
        <h2 className="text-xl font-semibold">Geen data beschikbaar</h2>
        <p className="text-dark/50 text-center max-w-md">
          Importeer Excel-bestanden van Media Markt om je dashboard te vullen met verkoop-, voorraad- en inkoopgegevens.
        </p>
        <button
          onClick={() => setActivePage('import')}
          className="mt-2 px-4 py-2 bg-gradient-to-r from-accent-light to-accent text-white rounded-lg hover:opacity-90 transition"
        >
          Excel importeren
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <StatCard
          label="Verkopen"
          value={totalSales.toLocaleString('nl-NL')}
          icon={<ShoppingCart size={16} />}
          sub={deltaPercent && (
            <span className={deltaPercent.startsWith('+') ? 'text-success' : 'text-danger'}>
              {deltaPercent} vs vorige week
            </span>
          )}
        />
        <StatCard label="Voorraad" value={totalStock.toLocaleString('nl-NL')} icon={<Package size={16} />} sub="meest recente week" />
        <StatCard label="Inkopen" value={totalPurchase.toLocaleString('nl-NL')} icon={<TrendingUp size={16} />} />
        <StatCard label="Producten" value={uniqueProducts} icon={<Box size={16} />} />
        <StatCard label="Winkels" value={uniqueStores} icon={<Store size={16} />} />
        <StatCard label="Weken" value={weekCount} icon={<Calendar size={16} />} />
      </div>

      <div className="bg-white border border-bg4 rounded-3xl shadow-sm p-4">
        <h3 className="text-sm font-medium text-dark/60 mb-3">Weektrend verkopen</h3>
        <TrendChart data={rows} market={selectedMarket} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-white border border-bg4 rounded-3xl shadow-sm p-4">
          <h3 className="text-sm font-medium text-dark/60 mb-3">Verkopen per merk</h3>
          <BrandChart data={rows} />
        </div>
        <div className="bg-white border border-bg4 rounded-3xl shadow-sm p-4">
          <h3 className="text-sm font-medium text-dark/60 mb-3">Top producten</h3>
          <TopProductsChart data={rows} displayName={displayName} />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-white border border-bg4 rounded-3xl shadow-sm p-4">
          <h3 className="text-sm font-medium text-dark/60 mb-3">Top winkels</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-dark/40 text-xs uppercase">
                  <th className="pb-2 pr-2">#</th>
                  <th className="pb-2 pr-2">Winkel</th>
                  <th className="pb-2 pr-2">Markt</th>
                  <th className="pb-2 pr-2 text-right">Verkopen</th>
                  <th className="pb-2"></th>
                </tr>
              </thead>
              <tbody>
                {storeGroups.map((s, i) => (
                  <tr key={s.store} className="border-t border-bg4">
                    <td className="py-1.5 pr-2 text-dark/40">{i + 1}</td>
                    <td className="py-1.5 pr-2 max-w-[200px]">
                      <button onClick={() => setActivePage('storedetail', s.store)} className="text-accent hover:underline truncate block text-left max-w-full" title={s.store}>{s.store}</button>
                    </td>
                    <td className="py-1.5 pr-2"><MarketPill market={s.market} /></td>
                    <td className="py-1.5 pr-2 text-right font-mono">{s.sales}</td>
                    <td className="py-1.5">{i < 3 && <RankBadge rank={i + 1} />}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="bg-white border border-bg4 rounded-3xl shadow-sm p-4">
          <h3 className="text-sm font-medium text-dark/60 mb-3">Lage voorraad</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-dark/40 text-xs uppercase">
                  <th className="pb-2 pr-2">Artikel</th>
                  <th className="pb-2 pr-2">Merk</th>
                  <th className="pb-2 text-right">Voorraad</th>
                </tr>
              </thead>
              <tbody>
                {lowStock.map((a) => (
                  <tr key={a.key} className="border-t border-bg4">
                    <td className="py-1.5 pr-2 max-w-[200px]">
                      <button onClick={() => setActivePage('productdetail', a.key)} className="text-accent hover:underline truncate block text-left max-w-full" title={a.name}>{a.name}</button>
                    </td>
                    <td className="py-1.5 pr-2 text-dark/50">{a.mfr}</td>
                    <td className={`py-1.5 text-right font-mono font-bold ${a.stock === 0 ? 'text-danger' : 'text-warning'}`}>
                      {a.stock}
                    </td>
                  </tr>
                ))}
                {lowStock.length === 0 && (
                  <tr><td colSpan={3} className="py-4 text-center text-dark/40">Geen producten met lage voorraad</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
