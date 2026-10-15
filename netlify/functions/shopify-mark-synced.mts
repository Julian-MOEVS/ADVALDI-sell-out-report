import type { Context } from '@netlify/functions';
import { isAuthorized, unauthorized } from '../shared/auth.mts';
import { serviceClient, isShopDomain } from '../shared/shopify.mts';

/**
 * POST /api/shopify-mark-synced
 * Body: { shop: "x.myshopify.com", syncedTo: "2026-06-25T..." } (ISO timestamp)
 * Werkt last_synced_to bij voor die ene winkel in shopify_tokens zodat de
 * volgende Auto Sync van die winkel vanaf daar verder gaat. Per winkel, want
 * een NAVEE-sync mag de Pure-datum niet vooruitzetten (dan slaat de volgende
 * Pure Auto Sync orders over).
 */
export default async (req: Request, _ctx: Context) => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  if (!isAuthorized(req)) return unauthorized();

  const supabase = serviceClient();
  if (!supabase) {
    return new Response(
      JSON.stringify({ error: 'Server is niet correct geconfigureerd.' }),
      { status: 500, headers: { 'content-type': 'application/json' } }
    );
  }

  let body: { shop?: string; syncedTo?: string };
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

  if (!body.shop || !isShopDomain(body.shop)) {
    return new Response(
      JSON.stringify({ error: 'shop is verplicht (x.myshopify.com)' }),
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

  const { error } = await supabase
    .from('shopify_tokens')
    .update({ last_synced_to: ts.toISOString() })
    .eq('shop', body.shop);

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

export const config = {
  path: '/api/shopify-mark-synced',
  rateLimit: { windowLimit: 20, windowSize: 60, aggregateBy: ['ip', 'domain'] as const },
};
