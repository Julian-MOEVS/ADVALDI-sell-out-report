import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/** Shopify Admin API versie, gedeeld door alle Shopify-functies. */
export const SHOPIFY_API_VERSION = '2026-04';

export interface ShopifyApp {
  clientId: string;
  clientSecret: string;
}

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
    const clientSecret = process.env[`SHOPIFY_CLIENT_SECRET${m[1] ?? ''}`];
    if (clientSecret) apps.push({ clientId, clientSecret });
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
