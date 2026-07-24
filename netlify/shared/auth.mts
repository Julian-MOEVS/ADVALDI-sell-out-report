import { timingSafeEqual } from 'node:crypto';

/**
 * Constant-time controle van de `Authorization: Bearer <API_SECRET>` header.
 * Gedeeld door alle browser-facing Netlify Functions. Gebruikt timingSafeEqual
 * zodat de vergelijking geen timing-side-channel op het geheim geeft.
 * (De Shopify OAuth-callback gebruikt dit NIET; die wordt door Shopify zelf
 * aangeroepen en is met HMAC beveiligd.)
 */
export function isAuthorized(req: Request): boolean {
  const apiSecret = process.env.API_SECRET;
  if (!apiSecret) return false;
  const provided = req.headers.get('authorization') || '';
  const expected = `Bearer ${apiSecret}`;
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  // Lengteverschil kort-sluiten (timingSafeEqual eist gelijke lengte). Het
  // enige dat hierdoor lekt is de lengte van het geheim, wat voor een high-
  // entropy secret geen bruikbare informatie is.
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/** Standaard 401-respons voor niet-geauthenticeerde requests. */
export function unauthorized(): Response {
  return new Response(JSON.stringify({ error: 'Unauthorized' }), {
    status: 401,
    headers: { 'content-type': 'application/json' },
  });
}
