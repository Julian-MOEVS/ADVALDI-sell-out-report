import { useAppStore } from '../../store/useAppStore';
import {
  LayoutDashboard, CalendarDays, Package, Store, Tags,
  FileSpreadsheet, Database, ShoppingBag, Globe, Box, X,
} from 'lucide-react';

const sections = [
  {
    title: 'ANALYSE',
    items: [
      { key: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
      { key: 'weekview', label: 'Per week', icon: CalendarDays },
      { key: 'products', label: 'Producten', icon: Package },
      { key: 'stores', label: 'Winkels', icon: Store },
      { key: 'brands', label: 'Merken', icon: Tags },
    ],
  },
  {
    title: 'IMPORT & BEHEER',
    items: [
      { key: 'import', label: 'Excel import', icon: FileSpreadsheet },
      { key: 'databeheer', label: 'Databeheer', icon: Database },
    ],
  },
  {
    title: 'PLATFORMEN',
    items: [
      { key: 'shopify', label: 'Shopify', icon: ShoppingBag },
      { key: 'woocommerce', label: 'WooCommerce', icon: Globe },
      { key: 'bol', label: 'Bol.com', icon: Box },
    ],
  },
];

export default function Sidebar() {
  const { activePage, setActivePage, allData, sidebarOpen, setSidebarOpen } = useAppStore();
  const rowCount = allData().length;

  return (
    <>
      {sidebarOpen && (
        <div className="fixed inset-0 bg-black/30 z-40 md:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      <aside
        className={`fixed top-0 left-0 h-full w-[240px] bg-gradient-to-b from-[#2563eb] to-[#1e3a5f] flex flex-col z-50 transition-transform md:translate-x-0 shadow-xl ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'
        }`}
      >
        <div className="flex items-center justify-between p-5 border-b border-white/10">
          <span className="text-lg font-semibold tracking-wide text-white">ADVALDI</span>
          <button className="md:hidden text-white/70" onClick={() => setSidebarOpen(false)}>
            <X size={18} />
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto py-3">
          {sections.map((s) => (
            <div key={s.title} className="mb-1">
              <div className="px-5 py-2 text-[10px] font-semibold text-white/40 tracking-widest">
                {s.title}
              </div>
              {s.items.map((item) => {
                const Icon = item.icon;
                const active = activePage === item.key;
                return (
                  <button
                    key={item.key}
                    onClick={() => { setActivePage(item.key); setSidebarOpen(false); }}
                    className={`w-full flex items-center gap-3 px-5 py-2.5 text-sm transition-all ${
                      active
                        ? 'text-white bg-white/20 border-r-3 border-white font-semibold'
                        : 'text-white/60 hover:text-white hover:bg-white/10 font-light'
                    }`}
                  >
                    <Icon size={17} />
                    {item.label}
                  </button>
                );
              })}
            </div>
          ))}
        </nav>

        <div className="p-5 border-t border-white/10 text-xs text-white/40 font-light">
          {rowCount.toLocaleString('nl-NL')} rijen geladen
        </div>
      </aside>
    </>
  );
}
