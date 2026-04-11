import type { CatalogEntry, ProductLink } from './supabase';

// Dynamic catalog loaded from Supabase (set at runtime)
let dynamicCatalog: Record<string, CatalogEntry> = {};
// Index by EAN for matching
let eanIndex: Record<string, string> = {}; // ean → sku
// Index by name (lowercased) for matching
let nameIndex: Record<string, string> = {}; // lowercase name → sku
// Manual links: article name → catalog SKU
let productLinks: Record<string, string> = {};

export function setDynamicCatalog(entries: CatalogEntry[]) {
  dynamicCatalog = {};
  eanIndex = {};
  nameIndex = {};
  for (const entry of entries) {
    dynamicCatalog[entry.sku] = entry;
    if (entry.ean) eanIndex[entry.ean] = entry.sku;
    if (entry.name) nameIndex[entry.name.toLowerCase()] = entry.sku;
  }
}

export function setProductLinks(links: ProductLink[]) {
  productLinks = {};
  for (const link of links) {
    productLinks[link.article_name] = link.catalog_sku;
  }
}

export function getProductLinks(): Record<string, string> {
  return { ...productLinks };
}

export function getDynamicCatalog(): CatalogEntry[] {
  return Object.values(dynamicCatalog);
}

export function getCatalogBySku(sku: string): CatalogEntry | undefined {
  return dynamicCatalog[sku];
}

/**
 * Try to match an article from sell-out data to a catalog entry.
 * Returns the catalog SKU if matched, undefined if not.
 * Match order: manual link → exact SKU → EAN → exact name match
 */
export function matchToCatalog(articleName: string, ean?: string, sku?: string): string | undefined {
  // 1. Manual link
  if (productLinks[articleName]) return productLinks[articleName];

  // 2. Exact SKU match
  if (sku && dynamicCatalog[sku]) return sku;

  // 3. Article name is a SKU
  if (dynamicCatalog[articleName]) return articleName;

  // 4. EAN match
  if (ean && eanIndex[ean]) return eanIndex[ean];

  // 5. Name match (case-insensitive)
  const nameLower = articleName.toLowerCase();
  if (nameIndex[nameLower]) return nameIndex[nameLower];

  return undefined;
}

/**
 * Get the display name for an article.
 * Priority: manual link → catalog by SKU → catalog by article name → original
 */
export function catalogDisplayName(articleName: string): string | undefined {
  // Check manual link first
  const linkedSku = productLinks[articleName];
  if (linkedSku && dynamicCatalog[linkedSku]) return dynamicCatalog[linkedSku].name;

  // Direct catalog lookup
  const dyn = dynamicCatalog[articleName];
  if (dyn) return dyn.name;

  return undefined;
}

export function catalogEan(articleName: string): string | undefined {
  const linkedSku = productLinks[articleName];
  if (linkedSku && dynamicCatalog[linkedSku]) return dynamicCatalog[linkedSku].ean;

  const dyn = dynamicCatalog[articleName];
  if (dyn) return dyn.ean;

  return undefined;
}

export function catalogBrand(articleName: string): string | undefined {
  const linkedSku = productLinks[articleName];
  if (linkedSku && dynamicCatalog[linkedSku]) return dynamicCatalog[linkedSku].brand;

  const dyn = dynamicCatalog[articleName];
  if (dyn) return dyn.brand;

  return undefined;
}

/**
 * Resolve the catalog SKU for an article name (via link or direct match)
 */
export function resolvedSku(articleName: string): string | undefined {
  if (productLinks[articleName]) return productLinks[articleName];
  if (dynamicCatalog[articleName]) return articleName;
  return undefined;
}
