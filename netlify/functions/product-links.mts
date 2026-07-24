import type { Context } from '@netlify/functions';
import { createClient } from '@supabase/supabase-js';

/**
 * /api/product-links — vervangt rechtstreekse anon-key toegang tot product_links.
 * GET: alle links. POST: batch upsert. DELETE (?article_name=...): één link verwijderen.
 */

interface ProductLink {
  article_name: string;
  catalog_sku: string;
}

const LINKS_TABLE = 'product_links';

function unauthorized() {
  return new Response(JSON.stringify({ error: 'Unauthorized' }), {
    status: 401,
    headers: { 'content-type': 'application/json' },
  });
}

export default async (req: Request, _ctx: Context) => {
  const apiSecret = process.env.API_SECRET;
  const authHeader = req.headers.get('authorization') || '';
  if (!apiSecret || authHeader !== `Bearer ${apiSecret}`) return unauthorized();

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
    const links: ProductLink[] = [];
    let from = 0;
    const pageSize = 1000;
    while (true) {
      const { data, error } = await supabase
        .from(LINKS_TABLE)
        .select('article_name, catalog_sku')
        .range(from, from + pageSize - 1);
      if (error) break;
      if (!data || data.length === 0) break;
      links.push(...(data as ProductLink[]));
      if (data.length < pageSize) break;
      from += pageSize;
    }
    return new Response(JSON.stringify({ links }), { status: 200, headers: { 'content-type': 'application/json' } });
  }

  if (req.method === 'POST') {
    let body: { links?: ProductLink[] };
    try {
      body = await req.json();
    } catch {
      return new Response(JSON.stringify({ error: 'Invalid JSON body' }), { status: 400, headers: { 'content-type': 'application/json' } });
    }
    const links = body.links || [];
    const BATCH = 500;
    let upserted = 0;
    for (let i = 0; i < links.length; i += BATCH) {
      const batch = links.slice(i, i + BATCH);
      const { error } = await supabase.from(LINKS_TABLE).upsert(batch, { onConflict: 'article_name' });
      if (error) return new Response(JSON.stringify({ success: false, count: upserted }), { status: 200, headers: { 'content-type': 'application/json' } });
      upserted += batch.length;
    }
    return new Response(JSON.stringify({ success: true, count: upserted }), { status: 200, headers: { 'content-type': 'application/json' } });
  }

  if (req.method === 'DELETE') {
    const url = new URL(req.url);
    const articleName = url.searchParams.get('article_name') || '';
    const { error } = await supabase.from(LINKS_TABLE).delete().eq('article_name', articleName);
    return new Response(JSON.stringify({ success: !error }), { status: 200, headers: { 'content-type': 'application/json' } });
  }

  return new Response('Method not allowed', { status: 405 });
};

export const config = {
  path: '/api/product-links',
  rateLimit: { windowLimit: 20, windowSize: 60, aggregateBy: ['ip', 'domain'] as const },
};
