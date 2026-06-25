import type { Context } from '@netlify/functions';
import { createClient } from '@supabase/supabase-js';

/**
 * GET /api/shopify-status
 * Returnt info over de huidige Shopify-koppeling: shop URL, scopes en moment van laatste sync.
 * Wordt gebruikt door de Shopify-pagina om de "Auto Sync (sinds laatste sync)" knop te tonen.
 */
export default async (_req: Request, _ctx: Context) => {
  const supabaseUrl = process.env.SUPABASE_URL || 'https://comqpyhbdsqifheoegjk.supabase.co';
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseServiceKey) {
    return new Response(
      JSON.stringify({ error: 'Server is niet correct geconfigureerd (SUPABASE_SERVICE_ROLE_KEY ontbreekt).' }),
      { status: 500, headers: { 'content-type': 'application/json' } }
    );
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey, { auth: { persistSession: false } });
  const { data, error } = await supabase
    .from('shopify_tokens')
    .select('shop, scope, installed_at, last_synced_to')
    .limit(1);

  if (error) {
    return new Response(
      JSON.stringify({ error: 'Kon shop status niet ophalen', detail: error.message }),
      { status: 500, headers: { 'content-type': 'application/json' } }
    );
  }

  if (!data || data.length === 0) {
    return new Response(
      JSON.stringify({ connected: false }),
      { status: 200, headers: { 'content-type': 'application/json' } }
    );
  }

  const row = data[0];
  return new Response(
    JSON.stringify({
      connected: true,
      shop: row.shop,
      scope: row.scope,
      installedAt: row.installed_at,
      lastSyncedTo: row.last_synced_to,
    }),
    { status: 200, headers: { 'content-type': 'application/json' } }
  );
};

export const config = { path: '/api/shopify-status' };
