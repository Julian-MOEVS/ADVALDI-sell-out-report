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
    <header className="sticky top-0 z-30 h-[60px] bg-white border-b border-bg4 flex items-center justify-between px-5 shadow-sm">
      <button className="md:hidden text-dark/60" onClick={() => setSidebarOpen(true)}>
        <Menu size={22} />
      </button>
      <div className="hidden md:block" />

      <div className="flex items-center gap-3">
        <select
          value={selectedWeek}
          onChange={(e) => setSelectedWeek(e.target.value)}
          className="bg-bg border border-bg4 rounded-2xl px-4 py-2 text-sm focus:outline-none focus:border-accent font-light"
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
          className="bg-bg border border-bg4 rounded-2xl px-4 py-2 text-sm focus:outline-none focus:border-accent font-light"
        >
          <option value="all">Alle markten</option>
          <option value="NL">Nederland</option>
          <option value="BE">België/Luxemburg</option>
        </select>

        <button
          onClick={() => setActivePage('import')}
          className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-accent-light to-accent text-white rounded-2xl hover:opacity-90 transition text-sm font-semibold shadow-md"
        >
          <Plus size={15} />
          Excel
        </button>
      </div>
    </header>
  );
}
