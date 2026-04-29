import { useMemo, useState } from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  BarChart, Bar,
} from 'recharts';
import { useAppStore } from '../store/useAppStore';
import { filtered, weeks, groupBy, stockForArticle } from '../lib/filters';
import {
  matchToCatalog, getProductLinks, getDynamicCatalog,
  setSingleProductLink, removeProductLink, addAliasInMemory,
  getAliasesForSku, removeAliasInMemory,
} from '../lib/catalog';
import { upsertProductLinks, deleteProductLink, upsertCatalogAlias, deleteCatalogAlias } from '../lib/supabase';
import StatCard from '../components/ui/StatCard';
import ChannelPill from '../components/ui/ChannelPill';
import StatusBadge from '../components/ui/StatusBadge';
import { ArrowLeft, ShoppingCart, Package, TrendingUp, Store, Link2, Unlink, X } from 'lucide-react';

export default function ProductDetail() {
  const { allData, detailId, selectedWeek, selectedChannel, displayName, setActivePage } = useAppStore();
  const data = allData();
  const articleName = detailId;

  // Find the resolved catalog SKU for this article, then include ALL rows that resolve to the same SKU
  const resolvedSku = useMemo(() => matchToCatalog(articleName), [articleName]);
  const allRows = useMemo(() => {
    if (!resolvedSku) return data.filter((r) => r.an === articleName);
    return data.filter((r) => {
      const rSku = matchToCatalog(r.an, r.ean, r.sku);
      return rSku === resolvedSku || r.an === articleName;
    });
  }, [data, articleName, resolvedSku]);
  const rows = useMemo(() => filtered(allRows, selectedWeek, selectedChannel), [allRows, selectedWeek, selectedChannel]);

  const allWeeks = weeks(data);
  const first = allRows[0];

  // Source articles linked to this product (for fixing wrong links)
  const [editingArticle, setEditingArticle] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [, forceUpdate] = useState(0);

  const sourceArticles = useMemo(() => {
    const links = getProductLinks();
    const byArticle: Record<string, { ean: string; sku: string; sales: number; channels: Set<string> }> = {};
    for (const r of allRows) {
      if (!byArticle[r.an]) byArticle[r.an] = { ean: r.ean, sku: r.sku, sales: 0, channels: new Set() };
      byArticle[r.an].sales += r.s;
      if (r.ch) byArticle[r.an].channels.add(r.ch);
    }
    return Object.entries(byArticle).map(([an, info]) => {
      let matchType: 'manual' | 'sku' | 'name' | 'ean' | 'none' = 'none';
      if (links[an]) matchType = 'manual';
      else if (info.sku && getDynamicCatalog().some((c) => c.sku === info.sku)) matchType = 'sku';
      else if (info.ean && getDynamicCatalog().some((c) => c.ean === info.ean)) matchType = 'ean';
      else if (matchToCatalog(an)) matchType = 'name';
      return { an, ean: info.ean, sku: info.sku, sales: info.sales, channels: [...info.channels], matchType };
    }).sort((a, b) => b.sales - a.sales);
  }, [allRows]);

  const catalog = useMemo(() => getDynamicCatalog(), []);
  const filteredCatalog = useMemo(() => {
    const q = searchTerm.toLowerCase();
    if (!q) return catalog.slice(0, 15);
    return catalog.filter(
      (c) => c.name.toLowerCase().includes(q) || c.sku.toLowerCase().includes(q) || c.ean.includes(q)
    ).slice(0, 15);
  }, [catalog, searchTerm]);

  const handleRelink = async (articleName: string, newSku: string) => {
    setSingleProductLink(articleName, newSku);
    await upsertProductLinks([{ article_name: articleName, catalog_sku: newSku }]);

    // Also store SKU/EAN aliases so future imports of the same SKU/EAN match correctly
    const sourceRow = allRows.find((r) => r.an === articleName);
    if (sourceRow) {
      const channel = sourceRow.ch || null;
      if (sourceRow.sku) {
        const ok = await upsertCatalogAlias({ catalog_sku: newSku, alias_sku: sourceRow.sku, alias_ean: null, source: channel });
        if (ok) addAliasInMemory({ catalog_sku: newSku, alias_sku: sourceRow.sku, alias_ean: null, source: channel });
      }
      if (sourceRow.ean) {
        const ok = await upsertCatalogAlias({ catalog_sku: newSku, alias_sku: null, alias_ean: sourceRow.ean, source: channel });
        if (ok) addAliasInMemory({ catalog_sku: newSku, alias_sku: null, alias_ean: sourceRow.ean, source: channel });
      }
    }

    setEditingArticle(null);
    setSearchTerm('');
    forceUpdate((n) => n + 1);
    setActivePage('products');
  };

  const aliases = useMemo(() => resolvedSku ? getAliasesForSku(resolvedSku) : [], [resolvedSku]);
  const [newAliasType, setNewAliasType] = useState<'sku' | 'ean'>('sku');
  const [newAliasValue, setNewAliasValue] = useState('');

  const handleAddAlias = async () => {
    const v = newAliasValue.trim();
    if (!v || !resolvedSku) return;
    const alias = newAliasType === 'sku'
      ? { catalog_sku: resolvedSku, alias_sku: v, alias_ean: null, source: 'manual' }
      : { catalog_sku: resolvedSku, alias_sku: null, alias_ean: v, source: 'manual' };
    const ok = await upsertCatalogAlias(alias);
    if (ok) {
      addAliasInMemory(alias);
      setNewAliasValue('');
      forceUpdate((n) => n + 1);
    }
  };

  const handleRemoveAlias = async (id?: string) => {
    if (!id) return;
    if (!confirm('Alias verwijderen?')) return;
    const ok = await deleteCatalogAlias(id);
    if (ok) {
      removeAliasInMemory(id);
      forceUpdate((n) => n + 1);
    }
  };

  const handleUnlink = async (articleName: string) => {
    if (!confirm(`Koppeling verwijderen voor "${articleName}"?`)) return;
    removeProductLink(articleName);
    await deleteProductLink(articleName);
    forceUpdate((n) => n + 1);
    setActivePage('products');
  };

  const totalSales = rows.reduce((a, r) => a + r.s, 0);
  const totalStock = stockForArticle(rows);
  const totalPurchase = rows.reduce((a, r) => a + r.p, 0);
  const storeCount = new Set(rows.map((r) => r.sl || r.st)).size;

  // Sales per week (trend)
  const weekTrend = useMemo(() => {
    const byWeek = groupBy(allRows, (r) => r.w);
    return allWeeks.map((w) => {
      const wRows = byWeek[w] || [];
      return {
        week: `W${w.slice(-2)}`,
        verkopen: wRows.reduce((a, r) => a + r.s, 0),
        voorraad: wRows.reduce((a, r) => a + r.k, 0),
        inkopen: wRows.reduce((a, r) => a + r.p, 0),
      };
    });
  }, [allRows, allWeeks]);

  // Per store breakdown
  const storeBreakdown = useMemo(() => {
    const g = groupBy(rows, (r) => r.sl || r.st);
    return Object.entries(g)
      .map(([store, sRows]) => ({
        store,
        channel: sRows[0].ch,
        sales: sRows.reduce((a, r) => a + r.s, 0),
        stock: stockForArticle(sRows),
        purchase: sRows.reduce((a, r) => a + r.p, 0),
      }))
      .sort((a, b) => b.sales - a.sales);
  }, [rows]);

  // Per week table
  const weekBreakdown = useMemo(() => {
    const byWeek = groupBy(rows, (r) => r.w);
    return weeks(rows).map((w) => {
      const wRows = byWeek[w] || [];
      return {
        w,
        sales: wRows.reduce((a, r) => a + r.s, 0),
        stock: wRows.reduce((a, r) => a + r.k, 0),
        purchase: wRows.reduce((a, r) => a + r.p, 0),
        stores: new Set(wRows.map((r) => r.sl || r.st)).size,
      };
    });
  }, [rows]);

  if (!first) {
    return (
      <div className="text-center text-dark/40 py-12">
        <p>Product niet gevonden.</p>
        <button onClick={() => setActivePage('products')} className="mt-3 text-accent hover:underline">
          Terug naar producten
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start gap-4">
        <button
          onClick={() => setActivePage('products')}
          className="mt-1 p-1.5 rounded-lg bg-bg hover:bg-bg4 transition text-dark/50 hover:text-dark"
        >
          <ArrowLeft size={18} />
        </button>
        <div className="flex-1 min-w-0">
          <h2 className="text-lg font-semibold truncate" title={articleName}>
            {displayName(articleName)}
          </h2>
          <div className="flex flex-wrap items-center gap-2 mt-1 text-sm text-dark/50">
            <span className="px-2 py-0.5 bg-bg rounded text-xs">{first.mfr}</span>
            <span className="px-2 py-0.5 bg-bg rounded text-xs">{first.pg}</span>
            <span className="text-xs text-dark/40">EAN: {first.ean}</span>
            <StatusBadge sales={totalSales} stock={totalStock} />
          </div>
          {displayName(articleName) !== articleName && (
            <p className="text-xs text-dark/40 mt-1 truncate" title={articleName}>
              Origineel: {articleName}
            </p>
          )}
        </div>
      </div>

      {/* KPI */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="Verkopen" value={totalSales.toLocaleString('nl-NL')} icon={<ShoppingCart size={16} />} />
        <StatCard label="Voorraad" value={totalStock.toLocaleString('nl-NL')} icon={<Package size={16} />} sub="meest recente week" />
        <StatCard label="Inkopen" value={totalPurchase.toLocaleString('nl-NL')} icon={<TrendingUp size={16} />} />
        <StatCard label="Winkels" value={storeCount} icon={<Store size={16} />} />
      </div>

      {/* Trend charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-white border border-bg4 rounded-3xl shadow-sm p-4">
          <h3 className="text-sm font-medium text-dark/60 mb-3">Verkopen per week</h3>
          <ResponsiveContainer width="100%" height={250}>
            <LineChart data={weekTrend}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="week" stroke="#999" fontSize={12} />
              <YAxis stroke="#999" fontSize={12} />
              <Tooltip contentStyle={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 16, boxShadow: '0 2px 8px rgba(0,0,0,0.08)' }} />
              <Line type="monotone" dataKey="verkopen" stroke="#2563eb" strokeWidth={2} dot={{ r: 3 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-white border border-bg4 rounded-3xl shadow-sm p-4">
          <h3 className="text-sm font-medium text-dark/60 mb-3">Voorraad & inkopen per week</h3>
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={weekTrend}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="week" stroke="#999" fontSize={12} />
              <YAxis stroke="#999" fontSize={12} />
              <Tooltip contentStyle={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 16, boxShadow: '0 2px 8px rgba(0,0,0,0.08)' }} />
              <Bar dataKey="voorraad" fill="#2563eb" radius={[4, 4, 0, 0]} />
              <Bar dataKey="inkopen" fill="#d97706" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* SKU & EAN aliases */}
      {resolvedSku && (
        <div className="bg-white border border-bg4 rounded-3xl shadow-sm p-4">
          <div className="flex items-center gap-2 mb-3">
            <Link2 size={16} className="text-dark/60" />
            <h3 className="text-sm font-medium text-dark/60">SKU's & EANs ({aliases.length + 1})</h3>
          </div>
          <p className="text-xs text-dark/40 mb-3">
            Catalogus-SKU + EAN zijn de primaire identifiers. Voeg extra SKU's of EANs toe (bv. Shopify- of MediaMarkt-codes) zodat imports met die waarden direct correct gematcht worden.
          </p>
          <div className="space-y-1 mb-3">
            <div className="flex items-center gap-2 py-2 px-3 bg-accent/5 border border-accent/20 rounded-lg">
              <span className="text-xs px-2 py-0.5 bg-accent/20 text-accent rounded font-semibold">PRIMARY</span>
              <code className="text-xs flex-1">{resolvedSku}</code>
              <span className="text-xs text-dark/50">SKU</span>
            </div>
            {first?.ean && (
              <div className="flex items-center gap-2 py-2 px-3 bg-accent/5 border border-accent/20 rounded-lg">
                <span className="text-xs px-2 py-0.5 bg-accent/20 text-accent rounded font-semibold">PRIMARY</span>
                <code className="text-xs flex-1">{first.ean}</code>
                <span className="text-xs text-dark/50">EAN</span>
              </div>
            )}
            {aliases.map((a) => (
              <div key={a.id || `${a.alias_sku}-${a.alias_ean}`} className="flex items-center gap-2 py-2 px-3 bg-bg rounded-lg">
                <span className="text-xs px-2 py-0.5 bg-info/20 text-info rounded">{a.alias_sku ? 'SKU' : 'EAN'}</span>
                <code className="text-xs flex-1">{a.alias_sku || a.alias_ean}</code>
                {a.source && <span className="text-xs text-dark/40">{a.source}</span>}
                <button
                  onClick={() => handleRemoveAlias(a.id)}
                  className="p-1 rounded hover:bg-danger/10 hover:text-danger text-dark/40 transition"
                  title="Alias verwijderen"
                >
                  <X size={12} />
                </button>
              </div>
            ))}
          </div>
          <div className="flex gap-2">
            <select
              value={newAliasType}
              onChange={(e) => setNewAliasType(e.target.value as 'sku' | 'ean')}
              className="bg-bg border border-bg4 rounded-lg px-3 py-1.5 text-xs"
            >
              <option value="sku">SKU</option>
              <option value="ean">EAN</option>
            </select>
            <input
              type="text"
              placeholder={newAliasType === 'sku' ? 'bv. SCPURZ041-00001' : 'bv. 5060937158002'}
              value={newAliasValue}
              onChange={(e) => setNewAliasValue(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleAddAlias(); }}
              className="flex-1 bg-bg border border-bg4 rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:border-accent"
            />
            <button
              onClick={handleAddAlias}
              disabled={!newAliasValue.trim()}
              className="px-3 py-1.5 bg-accent text-white rounded-lg text-xs hover:opacity-90 disabled:opacity-30 transition"
            >
              Toevoegen
            </button>
          </div>
        </div>
      )}

      {/* Bron-artikelen / koppelingen */}
      <div className="bg-white border border-bg4 rounded-3xl shadow-sm p-4">
        <div className="flex items-center gap-2 mb-3">
          <Link2 size={16} className="text-dark/60" />
          <h3 className="text-sm font-medium text-dark/60">Bron-artikelen ({sourceArticles.length})</h3>
        </div>
        <p className="text-xs text-dark/40 mb-3">
          Onderliggende artikelnamen die onder dit product vallen. Klopt het niet? Verplaats of verwijder de koppeling.
        </p>
        <div className="space-y-2">
          {sourceArticles.map((sa) => (
            <div key={sa.an} className="border border-bg4 rounded-xl p-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium truncate" title={sa.an}>{sa.an}</p>
                  <p className="text-xs text-dark/40 mt-0.5">
                    {sa.sku && <>SKU: <code className="bg-bg px-1 rounded">{sa.sku}</code> · </>}
                    {sa.ean && <>EAN: {sa.ean} · </>}
                    {sa.sales} verkopen
                    {sa.channels.length > 0 && <> · {sa.channels.join(', ')}</>}
                  </p>
                  <p className="text-xs mt-1">
                    Match: <span className={
                      sa.matchType === 'manual' ? 'text-warning' :
                      sa.matchType === 'sku' ? 'text-success' :
                      sa.matchType === 'ean' ? 'text-info' :
                      sa.matchType === 'name' ? 'text-dark/50' : 'text-danger'
                    }>
                      {sa.matchType === 'manual' ? 'handmatige koppeling' :
                       sa.matchType === 'sku' ? 'via SKU' :
                       sa.matchType === 'ean' ? 'via EAN' :
                       sa.matchType === 'name' ? 'via naam' : 'geen'}
                    </span>
                  </p>
                </div>
                <div className="flex gap-1 shrink-0">
                  <button
                    onClick={() => { setEditingArticle(editingArticle === sa.an ? null : sa.an); setSearchTerm(''); }}
                    className="p-1.5 rounded bg-bg hover:bg-bg4 transition text-dark/60"
                    title="Koppeling wijzigen"
                  >
                    <Link2 size={14} />
                  </button>
                  {sa.matchType === 'manual' && (
                    <button
                      onClick={() => handleUnlink(sa.an)}
                      className="p-1.5 rounded bg-bg hover:bg-danger/20 hover:text-danger transition text-dark/60"
                      title="Handmatige koppeling verwijderen"
                    >
                      <Unlink size={14} />
                    </button>
                  )}
                </div>
              </div>
              {editingArticle === sa.an && (
                <div className="mt-3 pt-3 border-t border-bg4">
                  <div className="flex gap-2 items-center mb-2">
                    <input
                      type="text"
                      autoFocus
                      placeholder="Zoek catalogus product (naam, SKU, EAN)..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="flex-1 bg-bg border border-bg4 rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:border-accent"
                    />
                    <button
                      onClick={() => { setEditingArticle(null); setSearchTerm(''); }}
                      className="p-1.5 rounded bg-bg hover:bg-bg4 text-dark/60"
                    >
                      <X size={14} />
                    </button>
                  </div>
                  <div className="max-h-48 overflow-y-auto border border-bg4 rounded-lg">
                    {filteredCatalog.map((c) => (
                      <button
                        key={c.sku}
                        onClick={() => handleRelink(sa.an, c.sku)}
                        className="w-full text-left px-3 py-1.5 text-xs hover:bg-bg4 transition flex justify-between items-center border-b border-bg4 last:border-0"
                      >
                        <span className="truncate">{c.name}</span>
                        <span className="text-dark/30 ml-2 shrink-0">{c.sku}</span>
                      </button>
                    ))}
                    {filteredCatalog.length === 0 && (
                      <p className="text-xs text-dark/40 px-3 py-2">Geen resultaten</p>
                    )}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Per store */}
      <div className="bg-white border border-bg4 rounded-3xl shadow-sm p-4">
        <h3 className="text-sm font-medium text-dark/60 mb-3">Per winkel</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-dark/40 text-xs uppercase">
                <th className="pb-2 pr-3">#</th>
                <th className="pb-2 pr-3">Winkel</th>
                <th className="pb-2 pr-3">Kanaal</th>
                <th className="pb-2 pr-3 text-right">Verkopen</th>
                <th className="pb-2 pr-3 text-right">Voorraad</th>
                <th className="pb-2 text-right">Inkopen</th>
              </tr>
            </thead>
            <tbody>
              {storeBreakdown.map((s, i) => (
                <tr key={s.store} className="border-t border-bg4 hover:bg-bg/50 transition">
                  <td className="py-1.5 pr-3 text-dark/40">{i + 1}</td>
                  <td className="py-1.5 pr-3">
                    <button
                      onClick={() => setActivePage('storedetail', s.store)}
                      className="text-accent hover:underline truncate max-w-[220px] block text-left"
                      title={s.store}
                    >
                      {s.store}
                    </button>
                  </td>
                  <td className="py-1.5 pr-3"><ChannelPill channel={s.channel} /></td>
                  <td className="py-1.5 pr-3 text-right font-mono">{s.sales}</td>
                  <td className="py-1.5 pr-3 text-right font-mono">{s.stock}</td>
                  <td className="py-1.5 text-right font-mono">{s.purchase}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Per week */}
      <div className="bg-white border border-bg4 rounded-3xl shadow-sm p-4">
        <h3 className="text-sm font-medium text-dark/60 mb-3">Per week</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-dark/40 text-xs uppercase">
                <th className="pb-2 pr-3">Week</th>
                <th className="pb-2 pr-3 text-right">Verkopen</th>
                <th className="pb-2 pr-3 text-right">Voorraad</th>
                <th className="pb-2 pr-3 text-right">Inkopen</th>
                <th className="pb-2 text-right">Winkels</th>
              </tr>
            </thead>
            <tbody>
              {weekBreakdown.map((w) => (
                <tr key={w.w} className="border-t border-bg4">
                  <td className="py-1.5 pr-3">W{w.w.slice(-2)} ({w.w})</td>
                  <td className="py-1.5 pr-3 text-right font-mono">{w.sales}</td>
                  <td className="py-1.5 pr-3 text-right font-mono">{w.stock}</td>
                  <td className="py-1.5 pr-3 text-right font-mono">{w.purchase}</td>
                  <td className="py-1.5 text-right font-mono">{w.stores}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
