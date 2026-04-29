import { useState, useMemo } from 'react';
import { useAppStore } from '../store/useAppStore';
import { EMBEDDED_DATA } from '../lib/data';
import { matchToCatalog } from '../lib/catalog';
import ChannelPill from '../components/ui/ChannelPill';
import { Database, Download, Trash2, RotateCcw, Search } from 'lucide-react';

export default function Databeheer() {
  const { allData, userData, aliases, platformConfig, removeUserCombo, setAlias, clearAlias, clearAllAliases } = useAppStore();
  const data = allData();

  const [search, setSearch] = useState('');

  // Row inspector filters
  const [rowWeek, setRowWeek] = useState<string>('all');
  const [rowChannel, setRowChannel] = useState<string>('all');
  const [rowSearch, setRowSearch] = useState('');

  // Week+channel combos
  const combos = useMemo(() => {
    const set = new Set(data.map((r) => `${r.w}|${r.ch}|${r.rg}`));
    return [...set].sort().map((key) => {
      const [w, ch, rg] = key.split('|') as [string, string, 'NL' | 'BE'];
      const allRows = data.filter((r) => r.w === w && r.ch === ch && r.rg === rg);
      const embeddedRows = EMBEDDED_DATA.filter((r) => r.w === w && r.ch === ch && r.rg === rg);
      const userRows = userData.filter((r) => r.w === w && r.ch === ch && r.rg === rg);
      const source =
        embeddedRows.length > 0 && userRows.length > 0
          ? 'Ingebouwd+Import'
          : embeddedRows.length > 0
          ? 'Ingebouwd'
          : 'Geïmporteerd';
      return {
        w,
        ch,
        rg,
        source,
        rows: allRows.length,
        sales: allRows.reduce((a, r) => a + r.s, 0),
        stock: allRows.reduce((a, r) => a + r.k, 0),
        canDelete: userRows.length > 0,
      };
    });
  }, [data, userData]);

  // Articles for alias editor
  const articles = useMemo(() => {
    const g = new Map<string, { an: string; mfr: string }>();
    for (const r of data) {
      if (!g.has(r.an)) g.set(r.an, { an: r.an, mfr: r.mfr });
    }
    const arr = [...g.values()];
    if (!search) return arr;
    const q = search.toLowerCase();
    return arr.filter((a) => a.an.toLowerCase().includes(q) || a.mfr.toLowerCase().includes(q));
  }, [data, search]);

  const allChannels = useMemo(() => [...new Set(data.map((r) => r.ch).filter(Boolean))].sort(), [data]);
  const allWeekVals = useMemo(() => [...new Set(data.map((r) => r.w))].sort(), [data]);

  const inspectRows = useMemo(() => {
    let list = data;
    if (rowWeek !== 'all') list = list.filter((r) => r.w === rowWeek);
    if (rowChannel !== 'all') list = list.filter((r) => r.ch === rowChannel);
    if (rowSearch) {
      const q = rowSearch.toLowerCase();
      list = list.filter(
        (r) =>
          r.an.toLowerCase().includes(q) ||
          (r.ean || '').toLowerCase().includes(q) ||
          (r.sku || '').toLowerCase().includes(q) ||
          (r.st || '').toLowerCase().includes(q)
      );
    }
    return list.slice(0, 500);
  }, [data, rowWeek, rowChannel, rowSearch]);

  const handleExportBackup = () => {
    const backup = {
      exported: new Date().toISOString(),
      userData,
      aliases,
      config: platformConfig,
    };
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `moevs-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-8">
      {/* Section 1: Data storage */}
      <section className="bg-white border border-bg4 rounded-3xl shadow-sm p-5">
        <h3 className="text-sm font-medium text-dark/60 mb-3 flex items-center gap-2">
          <Database size={16} /> Dataopslag
        </h3>
        <p className="text-sm text-dark/50 mb-3">
          Alle data wordt lokaal opgeslagen in je browser (localStorage). Er wordt niets naar een server gestuurd.
        </p>
        <div className="flex gap-4 text-sm text-dark/50 mb-4">
          <span>Ingebouwde rijen: <strong className="text-dark">{EMBEDDED_DATA.length}</strong></span>
          <span>Geïmporteerde rijen: <strong className="text-dark">{userData.length}</strong></span>
          <span>Productnamen (aliases): <strong className="text-dark">{Object.keys(aliases).length}</strong></span>
        </div>
        <button
          onClick={handleExportBackup}
          className="flex items-center gap-2 px-3 py-2 bg-bg text-dark/60 rounded-lg hover:bg-bg4 transition text-sm"
        >
          <Download size={14} /> Exporteer back-up
        </button>
      </section>

      {/* Section 2: Week management */}
      <section className="bg-white border border-bg4 rounded-3xl shadow-sm p-5">
        <h3 className="text-sm font-medium text-dark/60 mb-3">Weken beheren</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-dark/40 text-xs uppercase">
                <th className="pb-2 pr-3">Week</th>
                <th className="pb-2 pr-3">Kanaal</th>
                <th className="pb-2 pr-3">Bron</th>
                <th className="pb-2 pr-3 text-right">Rijen</th>
                <th className="pb-2 pr-3 text-right">Verkopen</th>
                <th className="pb-2 pr-3 text-right">Voorraad</th>
                <th className="pb-2">Actie</th>
              </tr>
            </thead>
            <tbody>
              {combos.map((c) => (
                <tr key={`${c.w}-${c.ch}-${c.rg}`} className="border-t border-bg4">
                  <td className="py-2 pr-3">Week {parseInt(c.w.slice(-2))} ({c.w})</td>
                  <td className="py-2 pr-3"><ChannelPill channel={c.ch} /></td>
                  <td className="py-2 pr-3">
                    <span className={`text-xs px-2 py-0.5 rounded ${
                      c.source === 'Ingebouwd' ? 'bg-gray-600/30 text-dark/50'
                        : c.source === 'Geïmporteerd' ? 'bg-accent/20 text-accent'
                        : 'bg-info/20 text-info'
                    }`}>
                      {c.source}
                    </span>
                  </td>
                  <td className="py-2 pr-3 text-right font-mono">{c.rows}</td>
                  <td className="py-2 pr-3 text-right font-mono">{c.sales}</td>
                  <td className="py-2 pr-3 text-right font-mono">{c.stock}</td>
                  <td className="py-2">
                    {c.canDelete && (
                      <button
                        onClick={() => {
                          if (confirm(`Weet je zeker dat je de geïmporteerde data voor week ${c.w} (${c.ch}) wilt verwijderen?`)) {
                            removeUserCombo(c.w, c.rg);
                          }
                        }}
                        className="text-danger hover:text-danger/80 transition"
                        title="Verwijder geïmporteerde data"
                      >
                        <Trash2 size={14} />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
              {combos.length === 0 && (
                <tr><td colSpan={7} className="py-6 text-center text-dark/40">Geen data beschikbaar</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Section 2b: Row inspector */}
      <section className="bg-white border border-bg4 rounded-3xl shadow-sm p-5">
        <h3 className="text-sm font-medium text-dark/60 mb-3 flex items-center gap-2">
          <Search size={16} /> Rijen inspecteren
        </h3>
        <p className="text-xs text-dark/50 mb-3">
          Bekijk individuele rijen in de database. Filter op week, kanaal en zoek op artikelnaam/EAN/SKU. Toont max. 500 rijen.
        </p>
        <div className="flex flex-wrap gap-2 mb-3">
          <select value={rowWeek} onChange={(e) => setRowWeek(e.target.value)} className="bg-bg border border-bg4 rounded-lg px-3 py-1.5 text-sm">
            <option value="all">Alle weken</option>
            {allWeekVals.map((w) => <option key={w} value={w}>Week {parseInt(w.slice(-2))} ({w})</option>)}
          </select>
          <select value={rowChannel} onChange={(e) => setRowChannel(e.target.value)} className="bg-bg border border-bg4 rounded-lg px-3 py-1.5 text-sm">
            <option value="all">Alle kanalen</option>
            {allChannels.map((ch) => <option key={ch} value={ch}>{ch}</option>)}
          </select>
          <input
            type="text"
            placeholder="Zoek op artikel / EAN / SKU / winkel..."
            value={rowSearch}
            onChange={(e) => setRowSearch(e.target.value)}
            className="flex-1 min-w-[200px] bg-bg border border-bg4 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-accent"
          />
        </div>
        <p className="text-xs text-dark/40 mb-2">{inspectRows.length} rijen getoond</p>
        <div className="overflow-x-auto max-h-[500px] overflow-y-auto">
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-white">
              <tr className="text-left text-dark/40 uppercase">
                <th className="pb-2 pr-2">Wk</th>
                <th className="pb-2 pr-2">Kanaal</th>
                <th className="pb-2 pr-2">Winkel</th>
                <th className="pb-2 pr-2">Artikel</th>
                <th className="pb-2 pr-2">EAN</th>
                <th className="pb-2 pr-2">SKU</th>
                <th className="pb-2 pr-2">Catalog SKU</th>
                <th className="pb-2 pr-2 text-right">Sales</th>
                <th className="pb-2 pr-2 text-right">Stock</th>
                <th className="pb-2 text-right">Inkoop</th>
              </tr>
            </thead>
            <tbody>
              {inspectRows.map((r, i) => {
                const matched = matchToCatalog(r.an, r.ean, r.sku);
                return (
                  <tr key={i} className="border-t border-bg4">
                    <td className="py-1 pr-2">{r.w.slice(-2)}</td>
                    <td className="py-1 pr-2">{r.ch}</td>
                    <td className="py-1 pr-2 truncate max-w-[120px]" title={r.st}>{r.st}</td>
                    <td className="py-1 pr-2 truncate max-w-[180px]" title={r.an}>{r.an}</td>
                    <td className="py-1 pr-2 font-mono text-dark/40">{r.ean}</td>
                    <td className="py-1 pr-2 font-mono text-dark/40">{r.sku}</td>
                    <td className="py-1 pr-2 font-mono text-xs">
                      {matched ? <span className="text-success">{matched}</span> : <span className="text-warning">—</span>}
                    </td>
                    <td className="py-1 pr-2 text-right font-mono">{r.s}</td>
                    <td className="py-1 pr-2 text-right font-mono">{r.k}</td>
                    <td className="py-1 text-right font-mono">{r.p}</td>
                  </tr>
                );
              })}
              {inspectRows.length === 0 && (
                <tr><td colSpan={10} className="py-6 text-center text-dark/40">Geen rijen gevonden</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Section 3: Product name aliases */}
      <section className="bg-white border border-bg4 rounded-3xl shadow-sm p-5">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-medium text-dark/60">Productnamen</h3>
          {Object.keys(aliases).length > 0 && (
            <button
              onClick={() => {
                if (confirm('Alle aangepaste namen resetten?')) clearAllAliases();
              }}
              className="text-xs text-danger hover:text-danger/80 transition"
            >
              Alle namen resetten
            </button>
          )}
        </div>
        <input
          type="text"
          placeholder="Zoek op artikelnaam of merk..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full bg-bg border border-bg4 rounded-lg px-4 py-2 text-sm mb-3 focus:outline-none focus:border-accent"
        />
        <div className="space-y-1 max-h-[400px] overflow-y-auto">
          {articles.slice(0, 50).map((a) => (
            <div key={a.an} className="flex items-center gap-3 py-1.5 px-2 rounded hover:bg-bg">
              <div className="flex-1 min-w-0">
                <span className="text-xs text-dark/40 truncate block" title={a.an}>{a.an}</span>
              </div>
              <span className="text-xs px-2 py-0.5 bg-bg4 text-dark/50 rounded shrink-0">{a.mfr}</span>
              <input
                type="text"
                placeholder="Weergavenaam"
                defaultValue={aliases[a.an] || ''}
                onBlur={(e) => {
                  const val = e.target.value.trim();
                  if (val && val !== a.an) setAlias(a.an, val);
                  else if (!val && aliases[a.an]) clearAlias(a.an);
                }}
                className="w-48 bg-bg border border-bg4 rounded px-2 py-1 text-sm focus:outline-none focus:border-accent"
              />
              {aliases[a.an] && (
                <button
                  onClick={() => clearAlias(a.an)}
                  className="text-dark/40 hover:text-dark transition"
                  title="Reset naam"
                >
                  <RotateCcw size={14} />
                </button>
              )}
            </div>
          ))}
          {articles.length === 0 && (
            <p className="text-center text-dark/40 py-4">Geen artikelen gevonden</p>
          )}
          {articles.length > 50 && (
            <p className="text-xs text-dark/40 text-center py-2">...en {articles.length - 50} overige. Gebruik de zoekbalk om te filteren.</p>
          )}
        </div>
      </section>
    </div>
  );
}
