/**
 * De Shopify-winkels waarvan het dashboard D2C-orders ophaalt. Elke winkel
 * schrijft naar een EIGEN kanaal (`ch`), omdat de sync in replace-mode per
 * kanaal + week eerst bestaande rijen verwijdert: deelden Pure en NAVEE één
 * kanaal, dan zou een NAVEE-sync de Pure-orders van die weken wissen.
 * In de weergave vallen alle Shopify-kanalen samen onder 'Shopify - D2C'
 * (zie normalizeChannel in filters.ts); het merk (`mfr`) houdt ze uit elkaar.
 */
export interface ShopifyShop {
  /** *.myshopify.com-domein, gelijk aan de `shop` in shopify_tokens. */
  domain: string;
  label: string;
  /** Kanaalnaam in sell_out_data. Moet met 'Shopify' beginnen. */
  channel: string;
  /** Merk voor orderregels zonder (herkenbare) vendor. */
  defaultBrand: string;
  /**
   * Webshoporders van deze winkel worden (soms) ook in Brincr ingevoerd, als
   * particuliere klant. Die Brincr-regels worden dan weggestreept tegen de
   * Shopify-orders (zie dedupeBrincrWebshop in filters.ts).
   */
  ordersAlsoInBrincr?: boolean;
}

export const SHOPIFY_SHOPS: ShopifyShop[] = [
  {
    domain: 'pure-scooters-belgium.myshopify.com',
    label: 'Pure Electric Benelux',
    channel: 'Shopify - D2C',
    defaultBrand: 'Pure Electric',
  },
  {
    domain: '08azzh-eu.myshopify.com',
    label: 'NAVEE Benelux (naveetech.nl)',
    channel: 'Shopify - NAVEE',
    defaultBrand: 'NAVEE',
    // Sinds sep 2026 worden NAVEE-webshoporders tijdelijk ook in Brincr
    // geïmporteerd (per week en model 1-op-1 nagerekend op 15 okt 2026).
    ordersAlsoInBrincr: true,
  },
];

/**
 * Merk uit de Shopify-vendor. Alle Pure-varianten (Pure, Pure Electric, Pure
 * Electric Benelux) worden 'Pure Electric', alle NAVEE-varianten (NAVEE, NAVEE
 * Tech, NAVEE Benelux) worden 'NAVEE', de naam waarop het NAVEE-dashboard
 * filtert. Andere vendors (bijv. ABUS, ChargeFee) blijven staan zoals ze zijn.
 */
export function vendorToBrand(raw: string, shop: ShopifyShop): string {
  const v = (raw || '').trim();
  if (!v) return shop.defaultBrand;
  const lower = v.toLowerCase();
  if (lower.includes('pure')) return 'Pure Electric';
  if (lower.includes('navee')) return 'NAVEE';
  return v;
}
