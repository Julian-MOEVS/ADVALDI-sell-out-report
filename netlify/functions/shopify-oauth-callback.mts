import type { Context } from '@netlify/functions';
import { timingSafeEqual } from 'node:crypto';
import { shopifyApps, serviceClient, isShopDomain, type ShopifyApp } from '../shared/shopify.mts';

/** HMAC-SHA256 (hex) van de callback-query, zoals Shopify die met de client secret ondertekent. */
async function signQuery(params: URLSearchParams, secret: string): Promise<string> {
  const sorted = [...params.entries()].sort(([a], [b]) => a.localeCompare(b));
  const message = sorted.map(([k, v]) => `${k}=${v}`).join('&');
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(message));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * OAuth callback voor Shopify Partner App custom distribution install.
 * Shopify redirect na install naar deze URL met query params { code, shop, hmac, state, timestamp }.
 * Wij wisselen de code in voor een offline access token en slaan die op in Supabase.
 *
 * Er kunnen meerdere apps zijn (Pure en NAVEE zitten in verschillende winkels,
 * elk met een eigen app). De app die de callback ondertekende is de app waarvan
 * het geheim een geldige HMAC oplevert; met die app wisselen we de code in.
 */
export default async (req: Request, _ctx: Context) => {
  const apps = shopifyApps();
  const supabase = serviceClient();

  if (apps.length === 0) {
    return new Response(
      'Server is niet correct geconfigureerd: SHOPIFY_CLIENT_ID en SHOPIFY_CLIENT_SECRET ontbreken.',
      { status: 500 }
    );
  }
  if (!supabase) {
    return new Response(
      'Server is niet correct geconfigureerd: SUPABASE_SERVICE_ROLE_KEY ontbreekt.',
      { status: 500 }
    );
  }

  const url = new URL(req.url);
  const code = url.searchParams.get('code');
  const shop = url.searchParams.get('shop');
  const hmac = url.searchParams.get('hmac');
  const timestamp = url.searchParams.get('timestamp');

  if (!code || !shop) {
    return new Response('Missende query parameters (code of shop).', { status: 400 });
  }

  // Shop URL validatie: alleen *.myshopify.com toestaan
  if (!isShopDomain(shop)) {
    return new Response('Ongeldige shop URL.', { status: 400 });
  }

  // HMAC is VERPLICHT. Zonder geldige, door Shopify met de client secret
  // ondertekende hmac weigeren we de request (voorkomt geforceerde/vervalste
  // callbacks). Eerder was deze check optioneel (`if (hmac)`), wat betekende
  // dat het weglaten van de parameter de verificatie volledig oversloeg.
  if (!hmac) {
    return new Response('HMAC ontbreekt.', { status: 401 });
  }

  // Replay-bescherming: Shopify stuurt een unix timestamp mee. Weiger als die
  // ontbreekt of ouder is dan 5 minuten.
  const ts = Number(timestamp);
  if (!Number.isFinite(ts) || Math.abs(Date.now() / 1000 - ts) > 300) {
    return new Response('Verlopen of ontbrekende timestamp.', { status: 401 });
  }

  const params = new URLSearchParams(url.search);
  params.delete('hmac');
  params.delete('signature');
  let app: ShopifyApp | null = null;
  for (const candidate of apps) {
    const sigHex = await signQuery(params, candidate.clientSecret);
    // Constant-time vergelijking (voorkomt timing-side-channel op de hmac).
    const a = Buffer.from(sigHex);
    const b = Buffer.from(hmac);
    if (a.length === b.length && timingSafeEqual(a, b)) {
      app = candidate;
      break;
    }
  }
  if (!app) {
    return new Response('HMAC verificatie mislukt.', { status: 401 });
  }

  // Wissel code in voor access token
  const tokenRes = await fetch(`https://${shop}/admin/oauth/access_token`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ client_id: app.clientId, client_secret: app.clientSecret, code }),
  });

  if (!tokenRes.ok) {
    const errText = await tokenRes.text();
    return new Response(`Token exchange mislukt: ${tokenRes.status} ${errText}`, { status: 502 });
  }

  const tokenData = (await tokenRes.json()) as { access_token: string; scope: string };

  // Sla op in Supabase (upsert per shop)
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
  const appUrl = process.env.URL || 'https://advaldi-sell-out.netlify.app';
  return Response.redirect(`${appUrl}/?shopify_connected=${encodeURIComponent(shop)}`, 302);
};

export const config = {
  path: '/api/shopify-oauth-callback',
  rateLimit: { windowLimit: 20, windowSize: 60, aggregateBy: ['ip', 'domain'] as const },
};
