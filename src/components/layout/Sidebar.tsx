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
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div className="fixed inset-0 bg-black/50 z-40 md:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      <aside
        className={`fixed top-0 left-0 h-full w-[216px] bg-bg2 border-r border-white/5 flex flex-col z-50 transition-transform md:translate-x-0 ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'
        }`}
      >
        <div className="flex items-center justify-between p-4 border-b border-white/5">
          <span className="text-sm font-bold tracking-wide text-accent">MOEVS</span>
          <button className="md:hidden text-gray-400" onClick={() => setSidebarOpen(false)}>
            <X size={18} />
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto py-2">
          {sections.map((s) => (
            <div key={s.title} className="mb-2">
              <div className="px-4 py-2 text-[10px] font-semibold text-gray-500 tracking-widest">
                {s.title}
              </div>
              {s.items.map((item) => {
                const Icon = item.icon;
                const active = activePage === item.key;
                return (
                  <button
                    key={item.key}
                    onClick={() => { setActivePage(item.key); setSidebarOpen(false); }}
                    className={`w-full flex items-center gap-2.5 px-4 py-2 text-sm transition ${
                      active
                        ? 'text-accent bg-accent/10 border-r-2 border-accent'
                        : 'text-gray-400 hover:text-white hover:bg-white/5'
                    }`}
                  >
                    <Icon size={16} />
                    {item.label}
                  </button>
                );
              })}
            </div>
          ))}
        </nav>

        <div className="p-4 border-t border-white/5 text-xs text-gray-500">
          {rowCount.toLocaleString('nl-NL')} rijen geladen
        </div>
      </aside>
    </>
  );
}
