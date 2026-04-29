import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { AppState, AppActions, DataRow, PlatformConfig } from '../types';
import { EMBEDDED_DATA } from '../lib/data';
import { catalogDisplayName, setDynamicCatalog, setProductLinks, setCatalogAliases } from '../lib/catalog';
import { fetchAllRows, insertRows, deleteCombo, fetchCatalog, fetchProductLinks, createImport, deleteImport, fetchCatalogAliases } from '../lib/supabase';

export const useAppStore = create<AppState & AppActions>()(
  persist(
    (set, get) => ({
      userData: [],
      aliases: {},
      platformConfig: {},
      selectedWeek: 'all',
      selectedChannel: 'all',
      activePage: 'dashboard',
      detailId: '',
      sidebarOpen: false,

      addUserData: async (rows: DataRow[]) => {
        const result = await insertRows(rows);
        if (result.success) {
          const fresh = await fetchAllRows();
          set({ userData: fresh });
        } else {
          set((s) => ({ userData: [...s.userData, ...rows] }));
        }
      },

      importFiles: async (files: { filename: string; rows: DataRow[] }[]) => {
        for (const f of files) {
          if (f.rows.length === 0) continue;
          const channel = f.rows[0].ch || null;
          const rg = f.rows[0].rg || null;
          const weeks = [...new Set(f.rows.map((r) => r.w))].sort();
          const importId = await createImport({
            filename: f.filename,
            channel,
            rg,
            weeks,
            row_count: f.rows.length,
          });
          await insertRows(f.rows, importId || undefined);
        }
        const fresh = await fetchAllRows();
        set({ userData: fresh });
      },

      removeImport: async (id: string) => {
        const ok = await deleteImport(id);
        if (ok) {
          const fresh = await fetchAllRows();
          set({ userData: fresh });
        }
      },

      removeUserCombo: async (week: string, market: 'NL' | 'BE') => {
        const ok = await deleteCombo(week, market);
        if (ok) {
          const fresh = await fetchAllRows();
          set({ userData: fresh });
        } else {
          set((s) => ({
            userData: s.userData.filter((r) => !(r.w === week && r.rg === market)),
          }));
        }
      },

      setAlias: (orig: string, alias: string) =>
        set((s) => ({ aliases: { ...s.aliases, [orig]: alias } })),

      clearAlias: (orig: string) =>
        set((s) => {
          const next = { ...s.aliases };
          delete next[orig];
          return { aliases: next };
        }),

      clearAllAliases: () => set({ aliases: {} }),

      setPlatformConfig: (config: Partial<PlatformConfig>) =>
        set((s) => ({ platformConfig: { ...s.platformConfig, ...config } })),

      setSelectedWeek: (week) => set({ selectedWeek: week }),
      setSelectedChannel: (channel) => set({ selectedChannel: channel }),
      setActivePage: (page, detailId = '') => set({ activePage: page, detailId }),
      setSidebarOpen: (open) => set({ sidebarOpen: open }),

      allData: () => [...EMBEDDED_DATA, ...get().userData],

      displayName: (orig: string) => get().aliases[orig] || catalogDisplayName(orig) || orig,
    }),
    {
      name: 'moevs-store',
      partialize: (state) => ({
        aliases: state.aliases,
        platformConfig: state.platformConfig,
        selectedWeek: state.selectedWeek,
        selectedChannel: state.selectedChannel,
      }),
    }
  )
);

// Load data, catalog, links, and aliases from Supabase on app start
Promise.all([fetchAllRows(), fetchCatalog(), fetchProductLinks(), fetchCatalogAliases()]).then(([rows, catalog, links, aliases]) => {
  useAppStore.setState({ userData: rows });
  setDynamicCatalog(catalog);
  setProductLinks(links);
  setCatalogAliases(aliases);
});
