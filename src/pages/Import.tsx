import { useState, useCallback, useMemo } from 'react';
import { useAppStore } from '../store/useAppStore';
import { parseExcelFile, parseExportStatistics, parseFnacVdbCsv } from '../lib/excel';
import { matchToCatalog, getDynamicCatalog, setProductLinks } from '../lib/catalog';
import { upsertProductLinks, fetchProductLinks } from '../lib/supabase';
import type { DataRow } from '../types';
import type { ProductLink } from '../lib/supabase';
import MarketPill from '../components/ui/MarketPill';
import { Upload, FileSpreadsheet, Info, AlertTriangle, CheckCircle, Link2 } from 'lucide-react';

type ImportType = 'mediamarkt' | 'shopify' | 'brincr' | 'fnac_vdb';

const IMPORT_TYPES: { key: ImportType; label: string }[] = [
  { key: 'mediamarkt', label: 'Media Markt' },
  { key: 'shopify', label: 'Shopify' },
  { key: 'brincr', label: 'Brincr Portaal' },
  { key: 'fnac_vdb', label: 'FNAC / VDB' },
];

interface MatchResult {
  articleName: string;
  ean: string;
  sku: string;
  catalogSku: string | undefined;
  rowCount: number;
}

export default function Import() {
  const { addUserData, setActivePage } = useAppStore();
  const [importType, setImportType] = useState<ImportType>('mediamarkt');
  const [market, setMarket] = useState<'NL' | 'BE'>('NL');
  const [parsed, setParsed] = useState<DataRow[]>([]);
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  // Manual linking state: articleName → selected catalog SKU
  const [manualLinks, setManualLinks] = useState<Record<string, string>>({});
  const [searchTerms, setSearchTerms] = useState<Record<string, string>>({});

  const catalog = useMemo(() => getDynamicCatalog(), [parsed]);

  // Match results per unique article
  const matchResults = useMemo((): MatchResult[] => {
    if (parsed.length === 0) return [];
    const byArticle: Record<string, { ean: string; sku: string; count: number }> = {};
    for (const r of parsed) {
      if (!byArticle[r.an]) {
        byArticle[r.an] = { ean: r.ean, sku: r.sku, count: 0 };
      }
      byArticle[r.an].count++;
    }
    return Object.entries(byArticle).map(([an, info]) => ({
      articleName: an,
      ean: info.ean,
      sku: info.sku,
      catalogSku: manualLinks[an] || matchToCatalog(an, info.ean, info.sku),
      rowCount: info.count,
    }));
  }, [parsed, manualLinks]);

  const matched = matchResults.filter((m) => m.catalogSku);
  const unmatched = matchResults.filter((m) => !m.catalogSku);

  const handleFiles = useCallback(async (files: FileList | File[]) => {
    setLoading(true);
    const fileArr = Array.from(files);
    let allRows: DataRow[] = [];
    let nlCount = 0;
    let beCount = 0;

    for (const file of fileArr) {
      try {
        let result: { rows: DataRow[]; market: 'NL' | 'BE' };
        switch (importType) {
          case 'shopify':
            result = await parseExportStatistics(file, 'Shopify', market);
            break;
          case 'brincr':
            result = await parseExportStatistics(file, 'Brincr', market);
            break;
          case 'fnac_vdb':
            result = await parseFnacVdbCsv(file);
            break;
          default:
            result = await parseExcelFile(file);
        }
        allRows = [...allRows, ...result.rows];
        if (result.market === 'NL') nlCount += result.rows.length;
        else beCount += result.rows.length;
      } catch (err) {
        console.error('Fout bij inlezen:', err);
      }
    }

    setParsed(allRows);
    setManualLinks({});
    setSearchTerms({});
    const parts = [];
    if (nlCount > 0) parts.push(`${nlCount} NL`);
    if (beCount > 0) parts.push(`${beCount} BE/LU`);
    setStatus(`${fileArr.length} bestand(en) gelezen — ${allRows.length} rijen (${parts.join(', ')})`);
    setLoading(false);
  }, [importType, market]);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      if (e.dataTransfer.files.length > 0) handleFiles(e.dataTransfer.files);
    },
    [handleFiles]
  );

  const handleConfirm = async () => {
    setSaving(true);

    // Save manual links to Supabase
    const newLinks: ProductLink[] = Object.entries(manualLinks)
      .filter(([, sku]) => sku)
      .map(([article_name, catalog_sku]) => ({ article_name, catalog_sku }));

    if (newLinks.length > 0) {
      await upsertProductLinks(newLinks);
      const fresh = await fetchProductLinks();
      setProductLinks(fresh);
    }

    // Save data
    await addUserData(parsed);
    setParsed([]);
    setStatus('');
    setManualLinks({});
    setSaving(false);
    setActivePage('dashboard');
  };

  const setLink = (articleName: string, catalogSku: string) => {
    setManualLinks((prev) => ({ ...prev, [articleName]: catalogSku }));
  };

  const filteredCatalog = (articleName: string) => {
    const q = (searchTerms[articleName] || '').toLowerCase();
    if (!q) return catalog.slice(0, 10);
    return catalog.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.sku.toLowerCase().includes(q) ||
        c.ean.includes(q) ||
        c.brand.toLowerCase().includes(q)
    ).slice(0, 10);
  };

  return (
    <div className="space-y-6">
      {/* Import type selector */}
      <div>
        <label className="block text-xs text-dark/50 mb-2 uppercase tracking-wide">Importtype</label>
        <div className="flex flex-wrap gap-2">
          {IMPORT_TYPES.map((t) => (
            <button
              key={t.key}
              onClick={() => { setImportType(t.key); setParsed([]); setStatus(''); }}
              className={`px-4 py-2 rounded-2xl text-sm transition ${
                t.key === importType
                  ? 'bg-gradient-to-r from-accent-light to-accent text-white'
                  : 'bg-bg text-dark/50 hover:text-dark hover:bg-bg4'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Market selector for Shopify/Brincr */}
      {(importType === 'shopify' || importType === 'brincr') && (
        <div className="flex items-center gap-3">
          <label className="text-xs text-dark/50 uppercase tracking-wide">Markt:</label>
          {(['NL', 'BE'] as const).map((m) => (
            <button
              key={m}
              onClick={() => setMarket(m)}
              className={`px-3 py-1.5 rounded-lg text-sm transition ${
                m === market
                  ? 'bg-gradient-to-r from-accent-light to-accent text-white'
                  : 'bg-bg text-dark/50 hover:text-dark'
              }`}
            >
              {m === 'NL' ? 'Nederland' : 'België'}
            </button>
          ))}
        </div>
      )}

      {/* Info box */}
      <div className="bg-info/10 border border-info/20 rounded-xl p-4 flex gap-3">
        <Info size={20} className="text-info shrink-0 mt-0.5" />
        <div className="text-sm text-dark/60">
          {importType === 'mediamarkt' && (
            <>
              <p><strong>NL-bestanden:</strong> <code className="text-xs bg-bg px-1 rounded">Purchase_Sales_Stock_Report_</code></p>
              <p className="mt-1"><strong>BE/LU-bestanden:</strong> <code className="text-xs bg-bg px-1 rounded">Sales_and_Stock_Report_Week_</code></p>
            </>
          )}
          {importType === 'shopify' && (
            <p>Upload <code className="text-xs bg-bg px-1 rounded">export_statistics</code> bestanden van Shopify orders.</p>
          )}
          {importType === 'brincr' && (
            <p>Upload <code className="text-xs bg-bg px-1 rounded">export_statistics</code> bestanden van het Brincr Portaal.</p>
          )}
          {importType === 'fnac_vdb' && (
            <p>Upload het CSV-bestand van Pure Electric met FNAC en Vanden Borre data.</p>
          )}
        </div>
      </div>

      {/* Drop zone */}
      <div
        onDragOver={(e) => e.preventDefault()}
        onDrop={handleDrop}
        className="border-2 border-dashed border-bg4 rounded-xl p-12 text-center hover:border-accent/50 transition cursor-pointer"
        onClick={() => document.getElementById('file-input')?.click()}
      >
        <Upload size={40} className="mx-auto text-dark/40 mb-3" />
        <p className="text-dark/60">Sleep bestanden hierheen of klik om te selecteren</p>
        <p className="text-xs text-dark/40 mt-1">
          {importType === 'fnac_vdb' ? '.csv' : '.xlsx, .xls'}
        </p>
        <input
          id="file-input"
          type="file"
          multiple
          accept={importType === 'fnac_vdb' ? '.csv' : '.xlsx,.xls,.csv'}
          className="hidden"
          onChange={(e) => e.target.files && handleFiles(e.target.files)}
        />
      </div>

      {loading && <p className="text-center text-dark/50">Bestanden worden ingelezen...</p>}

      {status && !loading && (
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <FileSpreadsheet size={16} className="text-success" />
            <span className="text-sm text-success">{status}</span>
          </div>

          {/* Matching summary */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="bg-white border border-bg4 rounded-2xl p-4 flex items-center gap-3">
              <CheckCircle size={20} className="text-success" />
              <div>
                <p className="text-sm font-medium">{matched.length} gekoppeld</p>
                <p className="text-xs text-dark/40">Automatisch herkend via SKU, EAN of naam</p>
              </div>
            </div>
            <div className={`bg-white border rounded-2xl p-4 flex items-center gap-3 ${unmatched.length > 0 ? 'border-warning' : 'border-bg4'}`}>
              <AlertTriangle size={20} className={unmatched.length > 0 ? 'text-warning' : 'text-dark/30'} />
              <div>
                <p className="text-sm font-medium">{unmatched.length} niet gekoppeld</p>
                <p className="text-xs text-dark/40">
                  {unmatched.length > 0 ? 'Koppel handmatig hieronder of importeer zonder koppeling' : 'Alle producten herkend!'}
                </p>
              </div>
            </div>
          </div>

          {/* Unmatched products - manual linking */}
          {unmatched.length > 0 && (
            <div className="bg-white border border-warning/30 rounded-3xl shadow-sm p-4">
              <div className="flex items-center gap-2 mb-3">
                <Link2 size={16} className="text-warning" />
                <h3 className="text-sm font-medium">Handmatig koppelen</h3>
              </div>
              <div className="space-y-3">
                {unmatched.map((m) => (
                  <div key={m.articleName} className="border border-bg4 rounded-xl p-3">
                    <div className="flex items-start justify-between gap-3 mb-2">
                      <div>
                        <p className="text-sm font-medium">{m.articleName}</p>
                        <p className="text-xs text-dark/40">
                          {m.sku && `SKU: ${m.sku} · `}
                          {m.ean && `EAN: ${m.ean} · `}
                          {m.rowCount} rij(en)
                        </p>
                      </div>
                      {manualLinks[m.articleName] && (
                        <span className="text-xs text-success bg-success/10 px-2 py-0.5 rounded">Gekoppeld</span>
                      )}
                    </div>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        placeholder="Zoek catalogus product..."
                        value={searchTerms[m.articleName] || ''}
                        onChange={(e) => setSearchTerms((prev) => ({ ...prev, [m.articleName]: e.target.value }))}
                        className="flex-1 bg-bg border border-bg4 rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:border-accent"
                      />
                    </div>
                    {(searchTerms[m.articleName] || manualLinks[m.articleName]) && (
                      <div className="mt-2 max-h-32 overflow-y-auto">
                        {filteredCatalog(m.articleName).map((c) => (
                          <button
                            key={c.sku}
                            onClick={() => setLink(m.articleName, c.sku)}
                            className={`w-full text-left px-2 py-1.5 text-xs rounded hover:bg-bg4 transition flex justify-between items-center ${
                              manualLinks[m.articleName] === c.sku ? 'bg-accent/10 text-accent' : ''
                            }`}
                          >
                            <span className="truncate">{c.name}</span>
                            <span className="text-dark/30 ml-2 shrink-0">{c.sku}</span>
                          </button>
                        ))}
                        {filteredCatalog(m.articleName).length === 0 && (
                          <p className="text-xs text-dark/40 px-2 py-1">Geen resultaten</p>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Preview table */}
          <div className="bg-white border border-bg4 rounded-3xl shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-dark/40 text-xs uppercase bg-bg">
                    <th className="p-3">Week</th>
                    <th className="p-3">Markt</th>
                    <th className="p-3">Bron</th>
                    <th className="p-3">Artikel</th>
                    <th className="p-3">Koppeling</th>
                    <th className="p-3">Winkel</th>
                    <th className="p-3 text-right">Sales</th>
                    <th className="p-3 text-right">Stock</th>
                  </tr>
                </thead>
                <tbody>
                  {parsed.slice(0, 8).map((r, i) => {
                    const m = matchResults.find((x) => x.articleName === r.an);
                    const isLinked = m?.catalogSku;
                    return (
                      <tr key={i} className="border-t border-bg4">
                        <td className="p-3">{r.w}</td>
                        <td className="p-3"><MarketPill market={r.rg} /></td>
                        <td className="p-3 text-dark/50 text-xs">{r.ch || '—'}</td>
                        <td className="p-3 truncate max-w-[180px]" title={r.an}>{r.an}</td>
                        <td className="p-3">
                          {isLinked
                            ? <span className="text-xs text-success">Gekoppeld</span>
                            : <span className="text-xs text-warning">Niet gekoppeld</span>
                          }
                        </td>
                        <td className="p-3 truncate max-w-[150px]" title={r.sl}>{r.sl || r.st || '—'}</td>
                        <td className="p-3 text-right font-mono">{r.s}</td>
                        <td className="p-3 text-right font-mono">{r.k}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {parsed.length > 8 && (
              <p className="p-3 text-xs text-dark/40">...en {parsed.length - 8} overige rijen</p>
            )}
          </div>

          <div className="flex gap-3">
            <button
              onClick={handleConfirm}
              disabled={saving}
              className="px-4 py-2 bg-gradient-to-r from-accent-light to-accent text-white rounded-lg hover:opacity-90 transition disabled:opacity-50"
            >
              {saving ? 'Opslaan...' : `Importeren (${matched.length + Object.keys(manualLinks).length} gekoppeld, ${unmatched.length - Object.keys(manualLinks).length} ongekoppeld)`}
            </button>
            <button
              onClick={() => { setParsed([]); setStatus(''); setManualLinks({}); }}
              className="px-4 py-2 bg-bg text-dark/60 rounded-lg hover:bg-bg4 transition"
            >
              Annuleren
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
