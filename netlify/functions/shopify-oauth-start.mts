import type { Context } from '@netlify/functions';
import { shopifyApps, isShopDomain, verifyShopifyRequest } from '../shared/shopify.mts';

/**
 * GET /api/shopify-oauth-start?shop=...&hmac=...&timestamp=...
 *
 * Na een installatie via de custom-distribution-link (legacy install flow)
 * stuurt Shopify de winkeleigenaar naar de app-URL met een ondertekende query.
 * De app moet dan zelf de OAuth-autorisatie starten; zonder deze stap kwam de
 * installatie op het dashboard uit zonder dat er ooit een token werd
 * opgeslagen. De startpagina (main.tsx) stuurt zo'n verzoek hierheen door.
 *
 * De HMAC bepaalt welke app (Pure of NAVEE) de installatie ondertekende; met
 * die client-ID sturen we door naar Shopify's autorisatiescherm, dat daarna op
 * /api/shopify-oauth-callback uitkomt. Geheimen verlaten de server niet.
 */
export default async (req: Request, _ctx: Context) => {
  const apps = shopifyApps();
  if (apps.length === 0) {
    return new Response('Server is niet correct geconfigureerd: geen Shopify-apps ingesteld.', { status: 500 });
  }

  const url = new URL(req.url);
  const shop = url.searchParams.get('shop') || '';
  if (!isShopDomain(shop)) {
    return new Response('Ongeldige of ontbrekende shop.', { status: 400 });
  }

  const app = await verifyShopifyRequest(url, apps);
  if (!app) {
    return new Response('HMAC verificatie mislukt, of verlopen/ontbrekende timestamp.', { status: 401 });
  }

  const appUrl = process.env.URL || 'https://advaldi-sell-out.netlify.app';
  const authorize = new URL(`https://${shop}/admin/oauth/authorize`);
  authorize.searchParams.set('client_id', app.clientId);
  authorize.searchParams.set('scope', app.scopes);
  authorize.searchParams.set('redirect_uri', `${appUrl}/api/shopify-oauth-callback`);
  return Response.redirect(authorize.toString(), 302);
};

export const config = {
  path: '/api/shopify-oauth-start',
  rateLimit: { windowLimit: 20, windowSize: 60, aggregateBy: ['ip', 'domain'] as const },
};
