import { useState, useCallback } from 'react';
import { useAppStore } from '../store/useAppStore';
import { parseExcelFile, parseExportStatistics, parseFnacVdbCsv } from '../lib/excel';
import type { DataRow } from '../types';
import MarketPill from '../components/ui/MarketPill';
import { Upload, FileSpreadsheet, Info } from 'lucide-react';

type ImportType = 'mediamarkt' | 'shopify' | 'brincr' | 'fnac_vdb';

const IMPORT_TYPES: { key: ImportType; label: string }[] = [
  { key: 'mediamarkt', label: 'Media Markt' },
  { key: 'shopify', label: 'Shopify' },
  { key: 'brincr', label: 'Brincr Portaal' },
  { key: 'fnac_vdb', label: 'FNAC / VDB' },
];

export default function Import() {
  const { addUserData, setActivePage } = useAppStore();
  const [importType, setImportType] = useState<ImportType>('mediamarkt');
  const [market, setMarket] = useState<'NL' | 'BE'>('NL');
  const [parsed, setParsed] = useState<DataRow[]>([]);
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(false);

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
            result = await parseExportStatistics(file, 'Brincr Portaal', market);
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

  const handleConfirm = () => {
    addUserData(parsed);
    setParsed([]);
    setStatus('');
    setActivePage('dashboard');
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
              <p><strong>NL-bestanden:</strong> <code className="text-xs bg-bg px-1 rounded">Purchase_Sales_Stock_Report_</code> — winkels beginnen met N</p>
              <p className="mt-1"><strong>BE/LU-bestanden:</strong> <code className="text-xs bg-bg px-1 rounded">Sales_and_Stock_Report_Week_</code> — bevat &quot;Sales channel&quot; kolom</p>
            </>
          )}
          {importType === 'shopify' && (
            <p>Upload <code className="text-xs bg-bg px-1 rounded">export_statistics</code> bestanden van Shopify orders. Orders worden per week gegroepeerd op basis van orderdatum.</p>
          )}
          {importType === 'brincr' && (
            <p>Upload <code className="text-xs bg-bg px-1 rounded">export_statistics</code> bestanden van het Brincr Portaal. Orders worden per week gegroepeerd op basis van orderdatum.</p>
          )}
          {importType === 'fnac_vdb' && (
            <p>Upload het CSV-bestand van Pure Electric met FNAC en Vanden Borre data. Week en markt worden automatisch bepaald.</p>
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

          <div className="bg-white border border-bg4 rounded-3xl shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-dark/40 text-xs uppercase bg-bg">
                    <th className="p-3">Week</th>
                    <th className="p-3">Markt</th>
                    <th className="p-3">Bron</th>
                    <th className="p-3">Artikel</th>
                    <th className="p-3">Winkel</th>
                    <th className="p-3 text-right">Sales</th>
                    <th className="p-3 text-right">Stock</th>
                    <th className="p-3 text-right">Purchase</th>
                  </tr>
                </thead>
                <tbody>
                  {parsed.slice(0, 8).map((r, i) => (
                    <tr key={i} className="border-t border-bg4">
                      <td className="p-3">{r.w}</td>
                      <td className="p-3"><MarketPill market={r.rg} /></td>
                      <td className="p-3 text-dark/50 text-xs">{r.ch || '—'}</td>
                      <td className="p-3 truncate max-w-[180px]" title={r.an}>{r.an}</td>
                      <td className="p-3 truncate max-w-[150px]" title={r.sl}>{r.sl || r.st || '—'}</td>
                      <td className="p-3 text-right font-mono">{r.s}</td>
                      <td className="p-3 text-right font-mono">{r.k}</td>
                      <td className="p-3 text-right font-mono">{r.p}</td>
                    </tr>
                  ))}
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
              className="px-4 py-2 bg-gradient-to-r from-accent-light to-accent text-white rounded-lg hover:opacity-90 transition"
            >
              Toevoegen aan dashboard
            </button>
            <button
              onClick={() => { setParsed([]); setStatus(''); }}
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
