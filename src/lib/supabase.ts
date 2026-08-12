import type { DataRow } from '../types';
import { authHeaders } from './api';

/**
 * Data-laag voor sell-out data, catalogus, imports en aliases.
 * Praat NIET meer rechtstreeks met Supabase vanuit de browser (dat gebruikte een
 * publieke anon key zonder wachtwoord-check, en RLS bleek daar niet op ingesteld).
 * Alle calls gaan nu via de authenticated Netlify Functions (/api/data-rows,
 * /api/catalog, /api/product-links, /api/catalog-aliases, /api/imports), die
 * dezelfde API_SECRET-check doen als de Shopify-functions en de service-role key
 * server-side gebruiken.
 */

const JSON_HEADERS = { 'content-type': 'application/json' };

/** Fetch all rows. Gooit een Error bij fout zodat callers het kunnen tonen. */
export async function fetchAllRows(): Promise<DataRow[]> {
  const res = await fetch('/api/data-rows', { headers: authHeaders() });
  if (!res.ok) {
    throw new Error(`Data-rows fetch faalde: ${res.status}`);
  }
  const data = (await res.json()) as { rows: DataRow[] };
  return data.rows;
}

/** Insert rows (batched server-side). Bij falen: success=false met count = aantal reeds ingevoerde rijen vóór de fout. */
export async function insertRows(
  rows: DataRow[],
  importId?: string
): Promise<{ success: boolean; count: number; error?: string }> {
  if (rows.length === 0) return { success: true, count: 0 };
  const res = await fetch('/api/data-rows', {
    method: 'POST',
    headers: authHeaders(JSON_HEADERS),
    body: JSON.stringify({ rows, importId }),
  });
  if (!res.ok) return { success: false, count: 0, error: `HTTP ${res.status}` };
  return (await res.json()) as { success: boolean; count: number; error?: string };
}

/** Delete rows matching a week + market combo */
export async function deleteCombo(week: string, market: 'NL' | 'BE'): Promise<boolean> {
  const params = new URLSearchParams({ mode: 'combo', week, market });
  const res = await fetch(`/api/data-rows?${params}`, { method: 'DELETE', headers: authHeaders() });
  if (!res.ok) {
    console.error('deleteCombo faalde:', res.status);
    return false;
  }
  const data = (await res.json()) as { success: boolean };
  return data.success;
}

/** Delete all rows for a given sales channel (e.g. 'Shopify') */
export async function deleteChannel(channel: string): Promise<boolean> {
  const params = new URLSearchParams({ mode: 'channel', channel });
  const res = await fetch(`/api/data-rows?${params}`, { method: 'DELETE', headers: authHeaders() });
  if (!res.ok) {
    console.error('deleteChannel faalde:', res.status);
    return false;
  }
  const data = (await res.json()) as { success: boolean };
  return data.success;
}

/** Delete rows for a channel matching any of the given ISO weeks. Filtert ongeldige weken server-side (alleen YYYYWW). */
export async function deleteChannelWeeks(channel: string, weeks: string[]): Promise<boolean> {
  const valid = weeks.filter((w) => /^\d{6}$/.test(w));
  if (valid.length === 0) return true;
  const params = new URLSearchParams({ mode: 'channel-weeks', channel, weeks: valid.join(',') });
  const res = await fetch(`/api/data-rows?${params}`, { method: 'DELETE', headers: authHeaders() });
  if (!res.ok) {
    console.error('deleteChannelWeeks faalde:', res.status);
    return false;
  }
  const data = (await res.json()) as { success: boolean };
  return data.success;
}

/** Cleanup: verwijder rijen met ongeldige week (NaNNaN of niet YYYYWW). */
export async function deleteInvalidWeekRows(): Promise<{ deleted: number; success: boolean }> {
  const params = new URLSearchParams({ mode: 'invalid-week' });
  const res = await fetch(`/api/data-rows?${params}`, { method: 'DELETE', headers: authHeaders() });
  if (!res.ok) return { deleted: 0, success: false };
  return (await res.json()) as { deleted: number; success: boolean };
}

/** Cleanup: normaliseer alle merk-varianten voor een specifiek kanaal naar één canonieke naam. */
export async function normalizeChannelBrand(
  channel: string,
  fromPattern: string,
  toBrand: string
): Promise<{ updated: number; success: boolean }> {
  const res = await fetch('/api/data-rows', {
    method: 'PATCH',
    headers: authHeaders(JSON_HEADERS),
    body: JSON.stringify({ channel, fromPattern, toBrand }),
  });
  if (!res.ok) return { updated: 0, success: false };
  return (await res.json()) as { updated: number; success: boolean };
}

/** Herstel merken van export_statistics-rijen (Brincr/Shopify) die hardcoded 'Pure Electric' kregen, o.b.v. de catalogus (server-side). */
export async function rebrandStatisticsRows(): Promise<{ updated: number; success: boolean; articles?: string[] }> {
  const res = await fetch('/api/data-rows', {
    method: 'PATCH',
    headers: authHeaders(JSON_HEADERS),
    body: JSON.stringify({ mode: 'rebrand-statistics' }),
  });
  if (!res.ok) return { updated: 0, success: false };
  return (await res.json()) as { updated: number; success: boolean; articles?: string[] };
}

/* ── Catalog aliases (extra SKUs/EANs per catalog product) ── */

export interface CatalogAlias {
  id?: string;
  catalog_sku: string;
  alias_sku: string | null;
  alias_ean: string | null;
  source?: string | null;
}

export async function fetchCatalogAliases(): Promise<CatalogAlias[]> {
  const res = await fetch('/api/catalog-aliases', { headers: authHeaders() });
  if (!res.ok) {
    console.error('fetchCatalogAliases faalde:', res.status);
    return [];
  }
  const data = (await res.json()) as { aliases: CatalogAlias[] };
  return data.aliases;
}

export async function upsertCatalogAlias(alias: CatalogAlias): Promise<boolean> {
  const res = await fetch('/api/catalog-aliases', {
    method: 'POST',
    headers: authHeaders(JSON_HEADERS),
    body: JSON.stringify(alias),
  });
  if (!res.ok) {
    console.error('upsertCatalogAlias faalde:', res.status);
    return false;
  }
  const data = (await res.json()) as { success: boolean };
  return data.success;
}

export async function deleteCatalogAlias(id: string): Promise<boolean> {
  const params = new URLSearchParams({ id });
  const res = await fetch(`/api/catalog-aliases?${params}`, { method: 'DELETE', headers: authHeaders() });
  if (!res.ok) {
    console.error('deleteCatalogAlias faalde:', res.status);
    return false;
  }
  const data = (await res.json()) as { success: boolean };
  return data.success;
}

/* ── Imports tracking ── */

export interface ImportBatch {
  id: string;
  filename: string;
  channel: string | null;
  rg: string | null;
  weeks: string[] | null;
  row_count: number;
  imported_at: string;
}

export async function createImport(data: {
  filename: string;
  channel: string | null;
  rg: string | null;
  weeks: string[];
  row_count: number;
}): Promise<string | null> {
  const res = await fetch('/api/imports', {
    method: 'POST',
    headers: authHeaders(JSON_HEADERS),
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    console.error('createImport faalde:', res.status);
    return null;
  }
  const result = (await res.json()) as { id: string | null };
  return result.id;
}

export async function fetchImports(): Promise<ImportBatch[]> {
  const res = await fetch('/api/imports', { headers: authHeaders() });
  if (!res.ok) {
    console.error('fetchImports faalde:', res.status);
    return [];
  }
  const data = (await res.json()) as { imports: ImportBatch[] };
  return data.imports;
}

export async function deleteImport(id: string): Promise<boolean> {
  const params = new URLSearchParams({ id });
  const res = await fetch(`/api/imports?${params}`, { method: 'DELETE', headers: authHeaders() });
  if (!res.ok) {
    console.error('deleteImport faalde:', res.status);
    return false;
  }
  const data = (await res.json()) as { success: boolean };
  return data.success;
}

/* ── Product Catalog ── */

export interface CatalogEntry {
  sku: string;
  name: string;
  ean: string;
  brand: string;
}

/** Fetch all catalog entries */
export async function fetchCatalog(): Promise<CatalogEntry[]> {
  const res = await fetch('/api/catalog', { headers: authHeaders() });
  if (!res.ok) {
    console.error('fetchCatalog faalde:', res.status);
    return [];
  }
  const data = (await res.json()) as { entries: CatalogEntry[] };
  return data.entries;
}

/** Upsert catalog entries (replaces existing SKUs) */
export async function upsertCatalog(entries: CatalogEntry[]): Promise<{ success: boolean; count: number }> {
  const res = await fetch('/api/catalog', {
    method: 'POST',
    headers: authHeaders(JSON_HEADERS),
    body: JSON.stringify({ entries }),
  });
  if (!res.ok) return { success: false, count: 0 };
  return (await res.json()) as { success: boolean; count: number };
}

/** Delete all catalog entries */
export async function clearCatalog(): Promise<boolean> {
  const res = await fetch('/api/catalog', { method: 'DELETE', headers: authHeaders() });
  if (!res.ok) {
    console.error('clearCatalog faalde:', res.status);
    return false;
  }
  const data = (await res.json()) as { success: boolean };
  return data.success;
}

/** Update a single catalog product's fields. If sku changes, cascade to product_links and catalog_aliases. */
export async function updateCatalogEntry(
  oldSku: string,
  newFields: { sku: string; name: string; ean: string; brand: string }
): Promise<boolean> {
  const res = await fetch('/api/catalog', {
    method: 'PATCH',
    headers: authHeaders(JSON_HEADERS),
    body: JSON.stringify({ oldSku, ...newFields }),
  });
  if (!res.ok) {
    console.error('updateCatalogEntry faalde:', res.status);
    return false;
  }
  const data = (await res.json()) as { success: boolean };
  return data.success;
}

/* ── Product Links (sell-out article name → catalog SKU) ── */

export interface ProductLink {
  article_name: string;
  catalog_sku: string;
}

/** Fetch all product links */
export async function fetchProductLinks(): Promise<ProductLink[]> {
  const res = await fetch('/api/product-links', { headers: authHeaders() });
  if (!res.ok) {
    console.error('fetchProductLinks faalde:', res.status);
    return [];
  }
  const data = (await res.json()) as { links: ProductLink[] };
  return data.links;
}

/** Delete a single product link by article_name */
export async function deleteProductLink(article_name: string): Promise<boolean> {
  const params = new URLSearchParams({ article_name });
  const res = await fetch(`/api/product-links?${params}`, { method: 'DELETE', headers: authHeaders() });
  if (!res.ok) {
    console.error('deleteProductLink faalde:', res.status);
    return false;
  }
  const data = (await res.json()) as { success: boolean };
  return data.success;
}

/** Upsert product links */
export async function upsertProductLinks(links: ProductLink[]): Promise<{ success: boolean; count: number }> {
  if (links.length === 0) return { success: true, count: 0 };
  const res = await fetch('/api/product-links', {
    method: 'POST',
    headers: authHeaders(JSON_HEADERS),
    body: JSON.stringify({ links }),
  });
  if (!res.ok) return { success: false, count: 0 };
  return (await res.json()) as { success: boolean; count: number };
}
