import type { Context } from '@netlify/functions';
import { createClient } from '@supabase/supabase-js';

/**
 * POST /api/shopify-mark-synced
 * Body: { syncedTo: "2026-06-25T..." } (ISO timestamp)
 * Werkt last_synced_to bij in shopify_tokens zodat de volgende Auto Sync vanaf daar verder gaat.
 */
export default async (req: Request, _ctx: Context) => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  const supabaseUrl = process.env.SUPABASE_URL || 'https://comqpyhbdsqifheoegjk.supabase.co';
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseServiceKey) {
    return new Response(
      JSON.stringify({ error: 'Server is niet correct geconfigureerd.' }),
      { status: 500, headers: { 'content-type': 'application/json' } }
    );
  }

  let body: { syncedTo?: string };
  try {
    body = await req.json();
  } catch {
    return new Response(
      JSON.stringify({ error: 'Invalid JSON body' }),
      { status: 400, headers: { 'content-type': 'application/json' } }
    );
  }

  if (!body.syncedTo) {
    return new Response(
      JSON.stringify({ error: 'syncedTo is verplicht (ISO timestamp)' }),
      { status: 400, headers: { 'content-type': 'application/json' } }
    );
  }

  // Valideer dat het een echte datum is
  const ts = new Date(body.syncedTo);
  if (isNaN(ts.getTime())) {
    return new Response(
      JSON.stringify({ error: 'Ongeldige syncedTo waarde' }),
      { status: 400, headers: { 'content-type': 'application/json' } }
    );
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey, { auth: { persistSession: false } });
  // Update last_synced_to van alle rijen in shopify_tokens (in praktijk 1 rij per shop, doorgaans 1 totaal)
  const { error } = await supabase
    .from('shopify_tokens')
    .update({ last_synced_to: ts.toISOString() })
    .not('shop', 'is', null);

  if (error) {
    return new Response(
      JSON.stringify({ error: 'Update last_synced_to mislukt', detail: error.message }),
      { status: 500, headers: { 'content-type': 'application/json' } }
    );
  }

  return new Response(
    JSON.stringify({ success: true, syncedTo: ts.toISOString() }),
    { status: 200, headers: { 'content-type': 'application/json' } }
  );
};

export const config = { path: '/api/shopify-mark-synced' };
