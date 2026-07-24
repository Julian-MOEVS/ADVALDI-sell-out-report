import type { Context } from '@netlify/functions';
import { createClient } from '@supabase/supabase-js';
import { isAuthorized, unauthorized } from '../shared/auth.mts';

/**
 * /api/catalog-aliases — vervangt rechtstreekse anon-key toegang tot catalog_aliases.
 * GET: alle aliases. POST: alias toevoegen. DELETE (?id=...): alias verwijderen.
 */

interface CatalogAlias {
  id?: string;
  catalog_sku: string;
  alias_sku: string | null;
  alias_ean: string | null;
  source?: string | null;
}

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
    const { data, error } = await supabase.from(ALIASES_TABLE).select('id, catalog_sku, alias_sku, alias_ean, source');
    if (error) return new Response(JSON.stringify({ aliases: [] }), { status: 200, headers: { 'content-type': 'application/json' } });
    return new Response(JSON.stringify({ aliases: data || [] }), { status: 200, headers: { 'content-type': 'application/json' } });
  }

  if (req.method === 'POST') {
    let body: CatalogAlias;
    try {
      body = await req.json();
    } catch {
      return new Response(JSON.stringify({ error: 'Invalid JSON body' }), { status: 400, headers: { 'content-type': 'application/json' } });
    }
    const { error } = await supabase.from(ALIASES_TABLE).insert(body);
    if (error) {
      if (String(error.message || '').includes('duplicate')) {
        return new Response(JSON.stringify({ success: true }), { status: 200, headers: { 'content-type': 'application/json' } });
      }
      return new Response(JSON.stringify({ success: false }), { status: 200, headers: { 'content-type': 'application/json' } });
    }
    return new Response(JSON.stringify({ success: true }), { status: 200, headers: { 'content-type': 'application/json' } });
  }

  if (req.method === 'DELETE') {
    const url = new URL(req.url);
    const id = url.searchParams.get('id') || '';
    const { error } = await supabase.from(ALIASES_TABLE).delete().eq('id', id);
    return new Response(JSON.stringify({ success: !error }), { status: 200, headers: { 'content-type': 'application/json' } });
  }

  return new Response('Method not allowed', { status: 405 });
};

export const config = {
  path: '/api/catalog-aliases',
  rateLimit: { windowLimit: 20, windowSize: 60, aggregateBy: ['ip', 'domain'] as const },
};
