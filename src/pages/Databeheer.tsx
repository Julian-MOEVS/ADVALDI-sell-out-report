import { useState, useMemo } from 'react';
import { useAppStore } from '../store/useAppStore';
import { EMBEDDED_DATA } from '../lib/data';
import MarketPill from '../components/ui/MarketPill';
import { Database, Download, Trash2, RotateCcw } from 'lucide-react';

export default function Databeheer() {
  const { allData, userData, aliases, platformConfig, removeUserCombo, setAlias, clearAlias, clearAllAliases } = useAppStore();
  const data = allData();

  const [search, setSearch] = useState('');

  // Week+market combos
  const combos = useMemo(() => {
    const set = new Set(data.map((r) => `${r.w}|${r.rg}`));
    return [...set].sort().map((key) => {
      const [w, rg] = key.split('|') as [string, 'NL' | 'BE'];
      const allRows = data.filter((r) => r.w === w && r.rg === rg);
      const embeddedRows = EMBEDDED_DATA.filter((r) => r.w === w && r.rg === rg);
      const userRows = userData.filter((r) => r.w === w && r.rg === rg);
      const source =
        embeddedRows.length > 0 && userRows.length > 0
          ? 'Ingebouwd+Import'
          : embeddedRows.length > 0
          ? 'Ingebouwd'
          : 'Geïmporteerd';
      return {
        w,
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
      <section className="bg-bg2 border border-white/5 rounded-xl p-5">
        <h3 className="text-sm font-medium text-gray-300 mb-3 flex items-center gap-2">
          <Database size={16} /> Dataopslag
        </h3>
        <p className="text-sm text-gray-400 mb-3">
          Alle data wordt lokaal opgeslagen in je browser (localStorage). Er wordt niets naar een server gestuurd.
        </p>
        <div className="flex gap-4 text-sm text-gray-400 mb-4">
          <span>Ingebouwde rijen: <strong className="text-white">{EMBEDDED_DATA.length}</strong></span>
          <span>Geïmporteerde rijen: <strong className="text-white">{userData.length}</strong></span>
          <span>Productnamen (aliases): <strong className="text-white">{Object.keys(aliases).length}</strong></span>
        </div>
        <button
          onClick={handleExportBackup}
          className="flex items-center gap-2 px-3 py-2 bg-bg3 text-gray-300 rounded-lg hover:bg-bg4 transition text-sm"
        >
          <Download size={14} /> Exporteer back-up
        </button>
      </section>

      {/* Section 2: Week management */}
      <section className="bg-bg2 border border-white/5 rounded-xl p-5">
        <h3 className="text-sm font-medium text-gray-300 mb-3">Weken beheren</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-gray-500 text-xs uppercase">
                <th className="pb-2 pr-3">Week</th>
                <th className="pb-2 pr-3">Markt</th>
                <th className="pb-2 pr-3">Bron</th>
                <th className="pb-2 pr-3 text-right">Rijen</th>
                <th className="pb-2 pr-3 text-right">Verkopen</th>
                <th className="pb-2 pr-3 text-right">Voorraad</th>
                <th className="pb-2">Actie</th>
              </tr>
            </thead>
            <tbody>
              {combos.map((c) => (
                <tr key={`${c.w}-${c.rg}`} className="border-t border-white/5">
                  <td className="py-2 pr-3">Week {parseInt(c.w.slice(-2))} ({c.w})</td>
                  <td className="py-2 pr-3"><MarketPill market={c.rg} /></td>
                  <td className="py-2 pr-3">
                    <span className={`text-xs px-2 py-0.5 rounded ${
                      c.source === 'Ingebouwd' ? 'bg-gray-600/30 text-gray-400'
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
                          if (confirm(`Weet je zeker dat je de geïmporteerde data voor week ${c.w} (${c.rg}) wilt verwijderen?`)) {
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
                <tr><td colSpan={7} className="py-6 text-center text-gray-500">Geen data beschikbaar</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Section 3: Product name aliases */}
      <section className="bg-bg2 border border-white/5 rounded-xl p-5">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-medium text-gray-300">Productnamen</h3>
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
          className="w-full bg-bg3 border border-white/10 rounded-lg px-4 py-2 text-sm mb-3 focus:outline-none focus:border-accent"
        />
        <div className="space-y-1 max-h-[400px] overflow-y-auto">
          {articles.slice(0, 50).map((a) => (
            <div key={a.an} className="flex items-center gap-3 py-1.5 px-2 rounded hover:bg-bg3">
              <div className="flex-1 min-w-0">
                <span className="text-xs text-gray-500 truncate block" title={a.an}>{a.an}</span>
              </div>
              <span className="text-xs px-2 py-0.5 bg-bg4 text-gray-400 rounded shrink-0">{a.mfr}</span>
              <input
                type="text"
                placeholder="Weergavenaam"
                defaultValue={aliases[a.an] || ''}
                onBlur={(e) => {
                  const val = e.target.value.trim();
                  if (val && val !== a.an) setAlias(a.an, val);
                  else if (!val && aliases[a.an]) clearAlias(a.an);
                }}
                className="w-48 bg-bg3 border border-white/10 rounded px-2 py-1 text-sm focus:outline-none focus:border-accent"
              />
              {aliases[a.an] && (
                <button
                  onClick={() => clearAlias(a.an)}
                  className="text-gray-500 hover:text-white transition"
                  title="Reset naam"
                >
                  <RotateCcw size={14} />
                </button>
              )}
            </div>
          ))}
          {articles.length === 0 && (
            <p className="text-center text-gray-500 py-4">Geen artikelen gevonden</p>
          )}
          {articles.length > 50 && (
            <p className="text-xs text-gray-500 text-center py-2">...en {articles.length - 50} overige. Gebruik de zoekbalk om te filteren.</p>
          )}
        </div>
      </section>
    </div>
  );
}
