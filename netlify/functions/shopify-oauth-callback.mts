import type { Context } from '@netlify/functions';
import { createClient } from '@supabase/supabase-js';

/**
 * OAuth callback voor Shopify Partner App custom distribution install.
 * Shopify redirect na install naar deze URL met query params { code, shop, hmac, state, timestamp }.
 * Wij wisselen de code in voor een offline access token en slaan die op in Supabase.
 */
export default async (req: Request, _ctx: Context) => {
  const clientId = Netlify.env.get('SHOPIFY_CLIENT_ID');
  const clientSecret = Netlify.env.get('SHOPIFY_CLIENT_SECRET');
  const supabaseUrl = Netlify.env.get('SUPABASE_URL') || 'https://comqpyhbdsqifheoegjk.supabase.co';
  const supabaseServiceKey = Netlify.env.get('SUPABASE_SERVICE_ROLE_KEY');

  if (!clientId || !clientSecret) {
    return new Response(
      'Server is niet correct geconfigureerd: SHOPIFY_CLIENT_ID en SHOPIFY_CLIENT_SECRET ontbreken.',
      { status: 500 }
    );
  }
  if (!supabaseServiceKey) {
    return new Response(
      'Server is niet correct geconfigureerd: SUPABASE_SERVICE_ROLE_KEY ontbreekt.',
      { status: 500 }
    );
  }

  const url = new URL(req.url);
  const code = url.searchParams.get('code');
  const shop = url.searchParams.get('shop');
  const hmac = url.searchParams.get('hmac');

  if (!code || !shop) {
    return new Response('Missende query parameters (code of shop).', { status: 400 });
  }

  // Shop URL validatie: alleen *.myshopify.com toestaan
  if (!/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/i.test(shop)) {
    return new Response('Ongeldige shop URL.', { status: 400 });
  }

  // HMAC verificatie
  if (hmac) {
    const params = new URLSearchParams(url.search);
    params.delete('hmac');
    params.delete('signature');
    const sorted = [...params.entries()].sort(([a], [b]) => a.localeCompare(b));
    const message = sorted.map(([k, v]) => `${k}=${v}`).join('&');
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      'raw',
      encoder.encode(clientSecret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    );
    const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(message));
    const sigHex = [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('');
    if (sigHex !== hmac) {
      return new Response('HMAC verificatie mislukt.', { status: 401 });
    }
  }

  // Wissel code in voor access token
  const tokenRes = await fetch(`https://${shop}/admin/oauth/access_token`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ client_id: clientId, client_secret: clientSecret, code }),
  });

  if (!tokenRes.ok) {
    const errText = await tokenRes.text();
    return new Response(`Token exchange mislukt: ${tokenRes.status} ${errText}`, { status: 502 });
  }

  const tokenData = (await tokenRes.json()) as { access_token: string; scope: string };

  // Sla op in Supabase (upsert per shop)
  const supabase = createClient(supabaseUrl, supabaseServiceKey, { auth: { persistSession: false } });
  const { error: dbError } = await supabase
    .from('shopify_tokens')
    .upsert(
      {
        shop,
        access_token: tokenData.access_token,
        scope: tokenData.scope,
        installed_at: new Date().toISOString(),
      },
      { onConflict: 'shop' }
    );

  if (dbError) {
    return new Response(`Token opgehaald maar opslag mislukt: ${dbError.message}`, { status: 500 });
  }

  // Redirect naar app met success melding
  const appUrl = Netlify.env.get('URL') || 'https://advaldi-sell-out.netlify.app';
  return Response.redirect(`${appUrl}/?shopify_connected=${encodeURIComponent(shop)}`, 302);
};

export const config = { path: '/api/shopify-oauth-callback' };
