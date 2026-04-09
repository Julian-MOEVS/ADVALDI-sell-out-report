import { useState, useCallback } from 'react';
import { useAppStore } from '../store/useAppStore';
import { parseExcelFile } from '../lib/excel';
import type { DataRow } from '../types';
import MarketPill from '../components/ui/MarketPill';
import { Upload, FileSpreadsheet, Info } from 'lucide-react';

export default function Import() {
  const { addUserData, setActivePage } = useAppStore();
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
        const { rows, market } = await parseExcelFile(file);
        allRows = [...allRows, ...rows];
        if (market === 'NL') nlCount += rows.length;
        else beCount += rows.length;
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
  }, []);

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
      <div className="bg-info/10 border border-info/20 rounded-xl p-4 flex gap-3">
        <Info size={20} className="text-info shrink-0 mt-0.5" />
        <div className="text-sm text-gray-300">
          <p><strong>NL-bestanden:</strong> <code className="text-xs bg-bg3 px-1 rounded">Purchase_Sales_Stock_Report_</code> — winkels beginnen met N</p>
          <p className="mt-1"><strong>BE/LU-bestanden:</strong> <code className="text-xs bg-bg3 px-1 rounded">Sales_and_Stock_Report_Week_</code> — winkels beginnen met B of L, bevat &quot;Sales channel&quot; kolom</p>
        </div>
      </div>

      <div
        onDragOver={(e) => e.preventDefault()}
        onDrop={handleDrop}
        className="border-2 border-dashed border-white/10 rounded-xl p-12 text-center hover:border-accent/50 transition cursor-pointer"
        onClick={() => document.getElementById('file-input')?.click()}
      >
        <Upload size={40} className="mx-auto text-gray-500 mb-3" />
        <p className="text-gray-300">Sleep bestanden hierheen of klik om te selecteren</p>
        <p className="text-xs text-gray-500 mt-1">.xlsx, .xls of .csv</p>
        <input
          id="file-input"
          type="file"
          multiple
          accept=".xlsx,.xls,.csv"
          className="hidden"
          onChange={(e) => e.target.files && handleFiles(e.target.files)}
        />
      </div>

      {loading && <p className="text-center text-gray-400">Bestanden worden ingelezen...</p>}

      {status && !loading && (
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <FileSpreadsheet size={16} className="text-success" />
            <span className="text-sm text-success">{status}</span>
          </div>

          <div className="bg-bg2 border border-white/5 rounded-xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-gray-500 text-xs uppercase bg-bg3">
                    <th className="p-3">Week</th>
                    <th className="p-3">Markt</th>
                    <th className="p-3">Merk</th>
                    <th className="p-3">Artikel</th>
                    <th className="p-3">Winkel</th>
                    <th className="p-3 text-right">Sales</th>
                    <th className="p-3 text-right">Stock</th>
                    <th className="p-3 text-right">Purchase</th>
                  </tr>
                </thead>
                <tbody>
                  {parsed.slice(0, 8).map((r, i) => (
                    <tr key={i} className="border-t border-white/5">
                      <td className="p-3">{r.w}</td>
                      <td className="p-3"><MarketPill market={r.rg} /></td>
                      <td className="p-3">{r.mfr}</td>
                      <td className="p-3 truncate max-w-[180px]" title={r.an}>{r.an}</td>
                      <td className="p-3 truncate max-w-[150px]" title={r.sl}>{r.sl || r.st}</td>
                      <td className="p-3 text-right font-mono">{r.s}</td>
                      <td className="p-3 text-right font-mono">{r.k}</td>
                      <td className="p-3 text-right font-mono">{r.p}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {parsed.length > 8 && (
              <p className="p-3 text-xs text-gray-500">...en {parsed.length - 8} overige rijen</p>
            )}
          </div>

          <div className="flex gap-3">
            <button
              onClick={handleConfirm}
              className="px-4 py-2 bg-accent text-white rounded-lg hover:bg-accent/80 transition"
            >
              Toevoegen aan dashboard
            </button>
            <button
              onClick={() => { setParsed([]); setStatus(''); }}
              className="px-4 py-2 bg-bg3 text-gray-300 rounded-lg hover:bg-bg4 transition"
            >
              Annuleren
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
