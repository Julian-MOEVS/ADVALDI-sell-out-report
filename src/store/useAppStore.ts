import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { AppState, AppActions, DataRow, PlatformConfig } from '../types';
import { EMBEDDED_DATA } from '../lib/data';
import { catalogDisplayName, setDynamicCatalog, setProductLinks, setCatalogAliases } from '../lib/catalog';
import { fetchAllRows, insertRows, deleteCombo, deleteChannel, fetchCatalog, fetchProductLinks, createImport, deleteImport, fetchCatalogAliases } from '../lib/supabase';
import { isShopifyRefurbished } from '../lib/filters';

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
        if (!result.success) {
          // GEEN lokale fallback — die zou een schijn-import creëren die bij refresh weg is.
          throw new Error(`Opslaan in database mislukt: ${result.error || 'onbekende fout'} (${result.count}/${rows.length} ingevoerd)`);
        }
        try {
          const fresh = await fetchAllRows();
          set({ userData: fresh });
        } catch (e) {
          console.error('fetchAllRows na addUserData faalde:', e);
          // Data IS opgeslagen, alleen UI-refresh faalde
        }
      },

      importFiles: async (files: { filename: string; rows: DataRow[] }[]) => {
        const failures: { filename: string; error: string }[] = [];
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
          const result = await insertRows(f.rows, importId || undefined);
          if (!result.success) {
            failures.push({ filename: f.filename, error: result.error || 'onbekende fout' });
          }
        }
        try {
          const fresh = await fetchAllRows();
          set({ userData: fresh });
        } catch (e) {
          console.error('fetchAllRows na importFiles faalde:', e);
        }
        if (failures.length > 0) {
          throw new Error(
            `Import van ${failures.length} bestand(en) mislukt: ${failures.map((f) => `${f.filename} (${f.error})`).join('; ')}`
          );
        }
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

      removeChannel: async (channel: string) => {
        const ok = await deleteChannel(channel);
        if (ok) {
          const fresh = await fetchAllRows();
          set({ userData: fresh });
        } else {
          set((s) => ({
            userData: s.userData.filter((r) => r.ch !== channel),
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

      // Shopify-refurbished wordt hier uitgefilterd zodat die rijen nergens meetellen.
      allData: () => [...EMBEDDED_DATA, ...get().userData].filter((r) => !isShopifyRefurbished(r)),

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

// Laad data, catalogus, links en aliases uit de beveiligde API.
// MOET ná login draaien: de endpoints vereisen nu de Bearer-secret die pas bij
// het inloggen in sessionStorage komt. Wordt aangeroepen vanuit App.tsx zodra
// de gebruiker geauthenticeerd is. Settle elk endpoint apart zodat één failure
// niet alles blokkeert. Retourneert `unauthorized` zodat App bij een 401 (bv.
// na wachtwoord-rotatie) terug naar het loginscherm kan sturen.
export async function loadRemoteData(): Promise<{ ok: boolean; unauthorized: boolean }> {
  const [rowsR, catalogR, linksR, aliasesR] = await Promise.allSettled([
    fetchAllRows(),
    fetchCatalog(),
    fetchProductLinks(),
    fetchCatalogAliases(),
  ]);
  if (rowsR.status === 'fulfilled') {
    useAppStore.setState({ userData: rowsR.value });
  } else {
    console.error('fetchAllRows faalde:', rowsR.reason);
  }
  if (catalogR.status === 'fulfilled') setDynamicCatalog(catalogR.value);
  else console.error('fetchCatalog faalde:', catalogR.reason);
  if (linksR.status === 'fulfilled') setProductLinks(linksR.value);
  else console.error('fetchProductLinks faalde:', linksR.reason);
  if (aliasesR.status === 'fulfilled') setCatalogAliases(aliasesR.value);
  else console.error('fetchCatalogAliases faalde:', aliasesR.reason);

  const unauthorized =
    rowsR.status === 'rejected' &&
    String((rowsR.reason as Error)?.message ?? rowsR.reason).includes('401');
  return { ok: rowsR.status === 'fulfilled', unauthorized };
}
