import type { Context } from '@netlify/functions';
import { createClient } from '@supabase/supabase-js';
import { isAuthorized, unauthorized } from '../shared/auth.mts';

/**
 * /api/catalog — vervangt rechtstreekse anon-key toegang tot product_catalog.
 * GET: alle catalogusregels. POST: batch upsert. DELETE: hele catalogus leegmaken.
 * PATCH: één regel bijwerken (met SKU-hernoem cascade naar product_links/catalog_aliases).
 */

interface CatalogEntry {
  sku: string;
  name: string;
  ean: string;
  brand: string;
}

const CATALOG_TABLE = 'product_catalog';
const LINKS_TABLE = 'product_links';
const ALIASES_TABLE = 'catalog_aliases';

export default async (req: Request, _ctx: Context) => {
  if (!isAuthorized(req)) return unauthorized();

  const supabaseUrl = process.env.SUPABASE_URL || 'https://comqpyhbdsqifheoegjk.supabase.co';
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseServiceKey) {
    return new Response(
      JSON.stringify({ error: 'Server is niet correct geconfigureerd (SUPABASE_SERVICE_ROLE_KEY ontbreekt).' }),
      { status: 500, headers: { 'content-type': 'application/json' } }
    );
  }
  const supabase = createClient(supabaseUrl, supabaseServiceKey, { auth: { persistSession: false } });

  if (req.method === 'GET') {
    const entries: CatalogEntry[] = [];
    let from = 0;
    const pageSize = 1000;
    while (true) {
      const { data, error } = await supabase
        .from(CATALOG_TABLE)
        .select('sku, name, ean, brand')
        .range(from, from + pageSize - 1);
      if (error) break;
      if (!data || data.length === 0) break;
      entries.push(...(data as CatalogEntry[]));
      if (data.length < pageSize) break;
      from += pageSize;
    }
    return new Response(JSON.stringify({ entries }), { status: 200, headers: { 'content-type': 'application/json' } });
  }

  if (req.method === 'POST') {
    let body: { entries?: CatalogEntry[] };
    try {
      body = await req.json();
    } catch {
      return new Response(JSON.stringify({ error: 'Invalid JSON body' }), { status: 400, headers: { 'content-type': 'application/json' } });
    }
    const entries = body.entries || [];
    const BATCH = 500;
    let upserted = 0;
    for (let i = 0; i < entries.length; i += BATCH) {
      const batch = entries.slice(i, i + BATCH);
      const { error } = await supabase.from(CATALOG_TABLE).upsert(batch, { onConflict: 'sku' });
      if (error) return new Response(JSON.stringify({ success: false, count: upserted }), { status: 200, headers: { 'content-type': 'application/json' } });
      upserted += batch.length;
    }
    return new Response(JSON.stringify({ success: true, count: upserted }), { status: 200, headers: { 'content-type': 'application/json' } });
  }

  if (req.method === 'DELETE') {
    const { error } = await supabase.from(CATALOG_TABLE).delete().neq('sku', '');
    return new Response(JSON.stringify({ success: !error }), { status: 200, headers: { 'content-type': 'application/json' } });
  }

  if (req.method === 'PATCH') {
    let body: { oldSku?: string; sku?: string; name?: string; ean?: string; brand?: string };
    try {
      body = await req.json();
    } catch {
      return new Response(JSON.stringify({ error: 'Invalid JSON body' }), { status: 400, headers: { 'content-type': 'application/json' } });
    }
    const { oldSku, sku, name, ean, brand } = body;
    if (!oldSku || !sku) {
      return new Response(JSON.stringify({ error: 'oldSku en sku zijn verplicht' }), { status: 400, headers: { 'content-type': 'application/json' } });
    }

    if (oldSku !== sku) {
      const { error: insErr } = await supabase.from(CATALOG_TABLE).insert({ sku, name, ean, brand });
      if (insErr) return new Response(JSON.stringify({ success: false }), { status: 200, headers: { 'content-type': 'application/json' } });
      await supabase.from(LINKS_TABLE).update({ catalog_sku: sku }).eq('catalog_sku', oldSku);
      await supabase.from(ALIASES_TABLE).update({ catalog_sku: sku }).eq('catalog_sku', oldSku);
      const { error: delErr } = await supabase.from(CATALOG_TABLE).delete().eq('sku', oldSku);
      if (delErr) return new Response(JSON.stringify({ success: false }), { status: 200, headers: { 'content-type': 'application/json' } });
      return new Response(JSON.stringify({ success: true }), { status: 200, headers: { 'content-type': 'application/json' } });
    }

    const { error } = await supabase.from(CATALOG_TABLE).update({ name, ean, brand }).eq('sku', oldSku);
    return new Response(JSON.stringify({ success: !error }), { status: 200, headers: { 'content-type': 'application/json' } });
  }

  return new Response('Method not allowed', { status: 405 });
};

export const config = {
  path: '/api/catalog',
  rateLimit: { windowLimit: 20, windowSize: 60, aggregateBy: ['ip', 'domain'] as const },
};
