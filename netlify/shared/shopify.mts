import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { timingSafeEqual } from 'node:crypto';

/** Shopify Admin API versie, gedeeld door alle Shopify-functies. */
export const SHOPIFY_API_VERSION = '2026-04';

export interface ShopifyApp {
  clientId: string;
  clientSecret: string;
  /** Scopes die de OAuth-start aanvraagt (`SHOPIFY_SCOPES<_SUFFIX>`). */
  scopes: string;
}

/**
 * Standaardscopes als `SHOPIFY_SCOPES<_SUFFIX>` ontbreekt. Het hoofdpaar is de
 * Pure-app, die read_all_orders en read_inventory al toegekend heeft; extra
 * apps krijgen alleen wat de sync nodig heeft (read_all_orders moet per app
 * apart worden aangevraagd voordat Shopify hem accepteert).
 */
const DEFAULT_SCOPES_PRIMARY = 'read_all_orders,read_inventory,read_orders,read_products';
const DEFAULT_SCOPES_EXTRA = 'read_orders,read_products';

/**
 * Alle geconfigureerde Shopify-apps. Elke winkel buiten de Plus-organisatie van
 * Pure heeft een eigen app nodig (custom distribution geldt per winkel/org), dus
 * naast het hoofdpaar `SHOPIFY_CLIENT_ID`/`SHOPIFY_CLIENT_SECRET` kunnen extra
 * paren met een achtervoegsel staan, bijv. `SHOPIFY_CLIENT_ID_NAVEE` +
 * `SHOPIFY_CLIENT_SECRET_NAVEE`. Een paar zonder geheim wordt genegeerd.
 */
export function shopifyApps(): ShopifyApp[] {
  const apps: ShopifyApp[] = [];
  for (const [key, clientId] of Object.entries(process.env)) {
    const m = /^SHOPIFY_CLIENT_ID(_[A-Z0-9_]+)?$/.exec(key);
    if (!m || !clientId) continue;
    const suffix = m[1] ?? '';
    const clientSecret = process.env[`SHOPIFY_CLIENT_SECRET${suffix}`];
    const scopes =
      process.env[`SHOPIFY_SCOPES${suffix}`] || (suffix ? DEFAULT_SCOPES_EXTRA : DEFAULT_SCOPES_PRIMARY);
    if (clientSecret) apps.push({ clientId, clientSecret, scopes });
  }
  return apps;
}

/** Supabase service-role client, of null als de server niet geconfigureerd is. */
export function serviceClient(): SupabaseClient | null {
  const supabaseUrl = process.env.SUPABASE_URL || 'https://comqpyhbdsqifheoegjk.supabase.co';
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseServiceKey) return null;
  return createClient(supabaseUrl, supabaseServiceKey, { auth: { persistSession: false } });
}

/** Alleen echte *.myshopify.com-domeinen; voorkomt dat een query-param ergens anders heen wijst. */
export function isShopDomain(shop: string): boolean {
  return /^[a-z0-9][a-z0-9-]*\.myshopify\.com$/i.test(shop);
}

/** HMAC-SHA256 (hex) van een Shopify-query, zoals Shopify die met de client secret ondertekent. */
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
 * Controleert een door Shopify ondertekend verzoek (install-launch of OAuth-
 * callback) en geeft de app terug waarvan het geheim de `hmac` laat kloppen,
 * of null. Weigert ook een ontbrekende of meer dan 5 minuten oude timestamp
 * (replay-bescherming).
 */
export async function verifyShopifyRequest(url: URL, apps: ShopifyApp[]): Promise<ShopifyApp | null> {
  const hmac = url.searchParams.get('hmac');
  if (!hmac) return null;
  const ts = Number(url.searchParams.get('timestamp'));
  if (!Number.isFinite(ts) || Math.abs(Date.now() / 1000 - ts) > 300) return null;

  const params = new URLSearchParams(url.search);
  params.delete('hmac');
  params.delete('signature');
  for (const app of apps) {
    const sigHex = await signQuery(params, app.clientSecret);
    // Constant-time vergelijking (voorkomt timing-side-channel op de hmac).
    const a = Buffer.from(sigHex);
    const b = Buffer.from(hmac);
    if (a.length === b.length && timingSafeEqual(a, b)) return app;
  }
  return null;
}

type TokenResult = { token: string | null; error?: string };

/**
 * Client credentials grant: een app uit de Dev Dashboard ruilt zijn eigen
 * client-ID en geheim in voor een token, zonder OAuth-scherm. Werkt alleen als
 * app en winkel in dezelfde Dev Dashboard-organisatie zitten (anders
 * `shop_not_permitted`). Het token verloopt na 24 uur; zie getShopToken.
 */
async function clientCredentialsToken(shop: string, app: ShopifyApp): Promise<TokenResult & { scope?: string }> {
  let res: Response;
  try {
    res = await fetch(`https://${shop}/admin/oauth/access_token`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: app.clientId,
        client_secret: app.clientSecret,
      }),
    });
  } catch (e) {
    return { token: null, error: `Shopify niet bereikbaar: ${e instanceof Error ? e.message : 'netwerkfout'}` };
  }
  const body = (await res.json().catch(() => null)) as
    | { access_token?: string; scope?: string; error?: string; error_description?: string; errors?: unknown }
    | null;
  if (res.ok && body?.access_token) return { token: body.access_token, scope: body.scope };
  const reason = body?.error_description || body?.error || (body?.errors ? JSON.stringify(body.errors) : '');
  return { token: null, error: `HTTP ${res.status}${reason ? `: ${reason}` : ''}` };
}

/**
 * Token voor een winkel. Eerst het opgeslagen token uit shopify_tokens (OAuth-
 * installatie, zoals bij Pure). Ontbreekt dat, of is `refresh` gezet omdat
 * Shopify het token weigerde, dan proberen we per app de client credentials
 * grant; een gelukt token wordt opgeslagen (installed_at en last_synced_to
 * blijven staan). `error` bevat dan Shopify's eigen reden, zodat het dashboard
 * kan laten zien waarom koppelen niet lukt.
 */
export async function getShopToken(
  supabase: SupabaseClient,
  shop: string,
  { refresh = false }: { refresh?: boolean } = {}
): Promise<TokenResult> {
  const { data: row } = await supabase
    .from('shopify_tokens')
    .select('access_token')
    .eq('shop', shop)
    .maybeSingle();
  if (row?.access_token && !refresh) return { token: row.access_token };

  const errors: string[] = [];
  for (const app of shopifyApps()) {
    const res = await clientCredentialsToken(shop, app);
    if (res.token) {
      await supabase
        .from('shopify_tokens')
        .upsert({ shop, access_token: res.token, scope: res.scope ?? null }, { onConflict: 'shop' });
      return { token: res.token };
    }
    if (res.error) errors.push(res.error);
  }
  return {
    token: refresh ? null : row?.access_token ?? null,
    error: errors.length ? `Client credentials mislukt (${errors.join('; ')}).` : undefined,
  };
}
