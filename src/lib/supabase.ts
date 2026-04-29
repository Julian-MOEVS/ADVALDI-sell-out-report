import { createClient } from '@supabase/supabase-js';
import type { DataRow } from '../types';

const SUPABASE_URL = 'https://comqpyhbdsqifheoegjk.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNvbXFweWhiZHNxaWZoZW9lZ2prIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU4MTY1MTAsImV4cCI6MjA5MTM5MjUxMH0.bQjtxnh2VMV8dfCYEZMqqVH1TmvnZTsvaHEdCAJCUZI';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const TABLE = 'sell_out_data';

/** Fetch all rows from Supabase */
export async function fetchAllRows(): Promise<DataRow[]> {
  const rows: DataRow[] = [];
  let from = 0;
  const pageSize = 1000;

  while (true) {
    const { data, error } = await supabase
      .from(TABLE)
      .select('w, rg, mfr, pg, an, ean, sku, ch, st, sl, p, s, k')
      .range(from, from + pageSize - 1);

    if (error) {
      console.error('Supabase fetch error:', error);
      break;
    }

    if (!data || data.length === 0) break;
    rows.push(...(data as DataRow[]));
    if (data.length < pageSize) break;
    from += pageSize;
  }

  return rows;
}

/** Insert rows into Supabase (batched in chunks of 500) */
export async function insertRows(rows: DataRow[]): Promise<{ success: boolean; count: number }> {
  const BATCH = 500;
  let inserted = 0;

  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH).map((r) => ({
      w: r.w,
      rg: r.rg,
      mfr: r.mfr,
      pg: r.pg,
      an: r.an,
      ean: r.ean,
      sku: r.sku || '',
      ch: r.ch,
      st: r.st,
      sl: r.sl,
      p: r.p,
      s: r.s,
      k: r.k,
    }));

    const { error } = await supabase.from(TABLE).insert(batch);
    if (error) {
      console.error('Supabase insert error:', error);
      return { success: false, count: inserted };
    }
    inserted += batch.length;
  }

  return { success: true, count: inserted };
}

/** Delete rows matching a week + market combo */
export async function deleteCombo(week: string, market: 'NL' | 'BE'): Promise<boolean> {
  const { error } = await supabase
    .from(TABLE)
    .delete()
    .eq('w', week)
    .eq('rg', market);

  if (error) {
    console.error('Supabase delete error:', error);
    return false;
  }
  return true;
}

/* ── Product Catalog ── */

export interface CatalogEntry {
  sku: string;
  name: string;
  ean: string;
  brand: string;
}

const CATALOG_TABLE = 'product_catalog';

/** Fetch all catalog entries */
export async function fetchCatalog(): Promise<CatalogEntry[]> {
  const entries: CatalogEntry[] = [];
  let from = 0;
  const pageSize = 1000;

  while (true) {
    const { data, error } = await supabase
      .from(CATALOG_TABLE)
      .select('sku, name, ean, brand')
      .range(from, from + pageSize - 1);

    if (error) {
      console.error('Supabase catalog fetch error:', error);
      break;
    }

    if (!data || data.length === 0) break;
    entries.push(...(data as CatalogEntry[]));
    if (data.length < pageSize) break;
    from += pageSize;
  }

  return entries;
}

/** Upsert catalog entries (replaces existing SKUs) */
export async function upsertCatalog(entries: CatalogEntry[]): Promise<{ success: boolean; count: number }> {
  const BATCH = 500;
  let upserted = 0;

  for (let i = 0; i < entries.length; i += BATCH) {
    const batch = entries.slice(i, i + BATCH);
    const { error } = await supabase
      .from(CATALOG_TABLE)
      .upsert(batch, { onConflict: 'sku' });

    if (error) {
      console.error('Supabase catalog upsert error:', error);
      return { success: false, count: upserted };
    }
    upserted += batch.length;
  }

  return { success: true, count: upserted };
}

/** Delete all catalog entries */
export async function clearCatalog(): Promise<boolean> {
  const { error } = await supabase
    .from(CATALOG_TABLE)
    .delete()
    .neq('sku', '');

  if (error) {
    console.error('Supabase catalog clear error:', error);
    return false;
  }
  return true;
}

/* ── Product Links (sell-out article name → catalog SKU) ── */

export interface ProductLink {
  article_name: string;
  catalog_sku: string;
}

const LINKS_TABLE = 'product_links';

/** Fetch all product links */
export async function fetchProductLinks(): Promise<ProductLink[]> {
  const links: ProductLink[] = [];
  let from = 0;
  const pageSize = 1000;

  while (true) {
    const { data, error } = await supabase
      .from(LINKS_TABLE)
      .select('article_name, catalog_sku')
      .range(from, from + pageSize - 1);

    if (error) {
      console.error('Supabase links fetch error:', error);
      break;
    }

    if (!data || data.length === 0) break;
    links.push(...(data as ProductLink[]));
    if (data.length < pageSize) break;
    from += pageSize;
  }

  return links;
}

/** Delete a single product link by article_name */
export async function deleteProductLink(article_name: string): Promise<boolean> {
  const { error } = await supabase
    .from(LINKS_TABLE)
    .delete()
    .eq('article_name', article_name);
  if (error) {
    console.error('Supabase link delete error:', error);
    return false;
  }
  return true;
}

/** Upsert product links */
export async function upsertProductLinks(links: ProductLink[]): Promise<{ success: boolean; count: number }> {
  if (links.length === 0) return { success: true, count: 0 };
  const BATCH = 500;
  let upserted = 0;

  for (let i = 0; i < links.length; i += BATCH) {
    const batch = links.slice(i, i + BATCH);
    const { error } = await supabase
      .from(LINKS_TABLE)
      .upsert(batch, { onConflict: 'article_name' });

    if (error) {
      console.error('Supabase links upsert error:', error);
      return { success: false, count: upserted };
    }
    upserted += batch.length;
  }

  return { success: true, count: upserted };
}
