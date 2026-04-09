import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { AppState, AppActions, DataRow, PlatformConfig } from '../types';
import { EMBEDDED_DATA } from '../lib/data';

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

      addUserData: (rows: DataRow[]) =>
        set((s) => ({ userData: [...s.userData, ...rows] })),

      removeUserCombo: (week: string, market: 'NL' | 'BE') =>
        set((s) => ({
          userData: s.userData.filter((r) => !(r.w === week && r.rg === market)),
        })),

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

      displayName: (orig: string) => get().aliases[orig] || orig,
    }),
    {
      name: 'moevs-store',
      partialize: (state) => ({
        userData: state.userData,
        aliases: state.aliases,
        platformConfig: state.platformConfig,
        selectedWeek: state.selectedWeek,
        selectedMarket: state.selectedMarket,
      }),
    }
  )
);
