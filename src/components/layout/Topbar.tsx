import { useAppStore } from '../../store/useAppStore';
import { weeks } from '../../lib/filters';
import { Plus, Menu } from 'lucide-react';

export default function Topbar() {
  const {
    allData, selectedWeek, setSelectedWeek,
    selectedMarket, setSelectedMarket,
    setActivePage, setSidebarOpen,
  } = useAppStore();
  const data = allData();
  const allWeeks = weeks(data);

  return (
    <header className="sticky top-0 z-30 h-[50px] bg-bg border-b border-white/5 flex items-center justify-between px-4">
      <button className="md:hidden text-gray-400" onClick={() => setSidebarOpen(true)}>
        <Menu size={20} />
      </button>
      <div className="hidden md:block" />

      <div className="flex items-center gap-3">
        <select
          value={selectedWeek}
          onChange={(e) => setSelectedWeek(e.target.value)}
          className="bg-bg2 border border-white/10 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-accent"
        >
          <option value="all">Alle weken</option>
          {allWeeks.map((w) => (
            <option key={w} value={w}>
              Week {parseInt(w.slice(-2))} ({w})
            </option>
          ))}
        </select>

        <select
          value={selectedMarket}
          onChange={(e) => setSelectedMarket(e.target.value as 'all' | 'NL' | 'BE')}
          className="bg-bg2 border border-white/10 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-accent"
        >
          <option value="all">Alle markten</option>
          <option value="NL">Nederland</option>
          <option value="BE">België/Luxemburg</option>
        </select>

        <button
          onClick={() => setActivePage('import')}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-accent text-white rounded-lg hover:bg-accent/80 transition text-sm"
        >
          <Plus size={14} />
          Excel
        </button>
      </div>
    </header>
  );
}
