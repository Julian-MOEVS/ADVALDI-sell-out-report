import type { Context } from '@netlify/functions';
import { shopifyApps, serviceClient, isShopDomain, verifyShopifyRequest } from '../shared/shopify.mts';

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

  if (!code || !shop) {
    return new Response('Missende query parameters (code of shop).', { status: 400 });
  }

  // Shop URL validatie: alleen *.myshopify.com toestaan
  if (!isShopDomain(shop)) {
    return new Response('Ongeldige shop URL.', { status: 400 });
  }

  // HMAC is VERPLICHT en de timestamp mag niet ouder zijn dan 5 minuten
  // (replay-bescherming). Zonder geldige, door Shopify met een van onze client
  // secrets ondertekende hmac weigeren we de request (voorkomt geforceerde of
  // vervalste callbacks).
  const app = await verifyShopifyRequest(url, apps);
  if (!app) {
    return new Response('HMAC verificatie mislukt, of verlopen/ontbrekende timestamp.', { status: 401 });
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
