export interface DataRow {
  w: string;
  rg: 'NL' | 'BE';
  mfr: string;
  pg: string;
  an: string;
  ean: string;
  sku: string;
  ch: string;
  st: string;
  sl: string;
  p: number;
  s: number;
  k: number;
}

export interface PlatformConfig {
  shopify?: { url: string; apiKey: string; accessToken: string };
  woocommerce?: { url: string; consumerKey: string; consumerSecret: string };
  bol?: { clientId: string; clientSecret: string };
}

export interface AppState {
  userData: DataRow[];
  aliases: Record<string, string>;
  platformConfig: PlatformConfig;
  selectedWeek: 'all' | string;
  selectedChannel: 'all' | string;
  activePage: string;
  detailId: string;
  sidebarOpen: boolean;
}

export interface AppActions {
  addUserData: (rows: DataRow[]) => Promise<void> | void;
  importFiles: (files: { filename: string; rows: DataRow[] }[]) => Promise<void>;
  removeImport: (id: string) => Promise<void>;
  removeUserCombo: (week: string, market: 'NL' | 'BE') => Promise<void> | void;
  setAlias: (orig: string, alias: string) => void;
  clearAlias: (orig: string) => void;
  clearAllAliases: () => void;
  setPlatformConfig: (config: Partial<PlatformConfig>) => void;
  setSelectedWeek: (week: 'all' | string) => void;
  setSelectedChannel: (channel: 'all' | string) => void;
  setActivePage: (page: string, detailId?: string) => void;
  setSidebarOpen: (open: boolean) => void;
  allData: () => DataRow[];
  displayName: (orig: string) => string;
}
