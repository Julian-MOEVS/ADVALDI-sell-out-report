import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { AppState, AppActions, DataRow, PlatformConfig } from '../types';
import { EMBEDDED_DATA } from '../lib/data';
import { catalogDisplayName, setDynamicCatalog } from '../lib/catalog';
import { fetchAllRows, insertRows, deleteCombo, fetchCatalog } from '../lib/supabase';

export const useAppStore = create<AppState & AppActions>()(
  persist(
    (set, get) => ({
      userData: [],
      aliases: {},
      platformConfig: {},
      selectedWeek: 'all',
      selectedMarket: 'all',
      activePage: 'dashboard',
      detailId: '',
      sidebarOpen: false,

      addUserData: async (rows: DataRow[]) => {
        // Insert into Supabase first
        const result = await insertRows(rows);
        if (result.success) {
          // Refresh from Supabase to stay in sync
          const fresh = await fetchAllRows();
          set({ userData: fresh });
        } else {
          // Fallback: add locally
          set((s) => ({ userData: [...s.userData, ...rows] }));
        }
      },

      removeUserCombo: async (week: string, market: 'NL' | 'BE') => {
        const ok = await deleteCombo(week, market);
        if (ok) {
          const fresh = await fetchAllRows();
          set({ userData: fresh });
        } else {
          // Fallback: remove locally
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
      setSelectedMarket: (market) => set({ selectedMarket: market }),
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
        selectedMarket: state.selectedMarket,
      }),
    }
  )
);

// Load data and catalog from Supabase on app start
Promise.all([fetchAllRows(), fetchCatalog()]).then(([rows, catalog]) => {
  useAppStore.setState({ userData: rows });
  setDynamicCatalog(catalog);
});
