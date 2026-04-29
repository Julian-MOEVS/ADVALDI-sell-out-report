import type { CatalogEntry, ProductLink, CatalogAlias } from './supabase';

// Dynamic catalog loaded from Supabase (set at runtime)
let dynamicCatalog: Record<string, CatalogEntry> = {};
// Index by EAN for matching
let eanIndex: Record<string, string> = {}; // ean → sku
// Index by name (lowercased) for matching
let nameIndex: Record<string, string> = {}; // lowercase name → sku
// Manual links: article name → catalog SKU
let productLinks: Record<string, string> = {};
// Catalog aliases (extra SKUs/EANs per catalog product)
let aliasSkuIndex: Record<string, string> = {}; // alias_sku → catalog_sku
let aliasEanIndex: Record<string, string> = {}; // alias_ean → catalog_sku
let allAliases: CatalogAlias[] = [];

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

export function setSingleProductLink(articleName: string, catalogSku: string) {
  productLinks[articleName] = catalogSku;
}

export function removeProductLink(articleName: string) {
  delete productLinks[articleName];
}

export function setCatalogAliases(aliases: CatalogAlias[]) {
  allAliases = aliases;
  aliasSkuIndex = {};
  aliasEanIndex = {};
  for (const a of aliases) {
    if (a.alias_sku) aliasSkuIndex[a.alias_sku] = a.catalog_sku;
    if (a.alias_ean) aliasEanIndex[a.alias_ean] = a.catalog_sku;
  }
}

export function getAliasesForSku(catalogSku: string): CatalogAlias[] {
  return allAliases.filter((a) => a.catalog_sku === catalogSku);
}

export function addAliasInMemory(alias: CatalogAlias) {
  allAliases.push(alias);
  if (alias.alias_sku) aliasSkuIndex[alias.alias_sku] = alias.catalog_sku;
  if (alias.alias_ean) aliasEanIndex[alias.alias_ean] = alias.catalog_sku;
}

export function removeAliasInMemory(id: string) {
  allAliases = allAliases.filter((a) => a.id !== id);
  aliasSkuIndex = {};
  aliasEanIndex = {};
  for (const a of allAliases) {
    if (a.alias_sku) aliasSkuIndex[a.alias_sku] = a.catalog_sku;
    if (a.alias_ean) aliasEanIndex[a.alias_ean] = a.catalog_sku;
  }
}

export function getDynamicCatalog(): CatalogEntry[] {
  return Object.values(dynamicCatalog);
}

export function getCatalogBySku(sku: string): CatalogEntry | undefined {
  return dynamicCatalog[sku];
}

export function updateCatalogInMemory(oldSku: string, fields: CatalogEntry) {
  delete dynamicCatalog[oldSku];
  dynamicCatalog[fields.sku] = fields;
  // rebuild EAN/name indices
  eanIndex = {};
  nameIndex = {};
  for (const entry of Object.values(dynamicCatalog)) {
    if (entry.ean) eanIndex[entry.ean] = entry.sku;
    if (entry.name) nameIndex[entry.name.toLowerCase()] = entry.sku;
  }
  // rebuild alias indices since their catalog_sku may have changed
  for (const a of allAliases) {
    if (a.catalog_sku === oldSku) a.catalog_sku = fields.sku;
  }
  setCatalogAliases(allAliases);
}

/**
 * Try to match an article from sell-out data to a catalog entry.
 * Returns the catalog SKU if matched, undefined if not.
 *
 * Priority: SKU > EAN > manual name link > catalog name (exact, case-insensitive).
 * SKU/EAN match against both primary catalog values and stored aliases.
 */
export function matchToCatalog(articleName: string, ean?: string, sku?: string): string | undefined {
  // 1. SKU match (catalog primary or alias)
  if (sku) {
    if (dynamicCatalog[sku]) return sku;
    if (aliasSkuIndex[sku]) return aliasSkuIndex[sku];
  }

  // 2. EAN match (catalog primary or alias)
  if (ean) {
    if (eanIndex[ean]) return eanIndex[ean];
    if (aliasEanIndex[ean]) return aliasEanIndex[ean];
  }

  // 3. Article name as a catalog SKU (rare, but supported)
  if (dynamicCatalog[articleName]) return articleName;

  // 4. Manual article-name link (used for legacy / name-only mappings)
  if (productLinks[articleName]) return productLinks[articleName];

  // 5. Catalog name match (case-insensitive, exact)
  const nameLower = articleName.toLowerCase();
  if (nameIndex[nameLower]) return nameIndex[nameLower];

  return undefined;
}

/**
 * Get the display name for an article.
 * Priority: manual link → catalog by SKU → catalog by article name → original
 */
export function catalogDisplayName(articleName: string): string | undefined {
  const sku = matchToCatalog(articleName);
  if (sku && dynamicCatalog[sku]) return dynamicCatalog[sku].name;
  return undefined;
}

export function catalogEan(articleName: string): string | undefined {
  const sku = matchToCatalog(articleName);
  if (sku && dynamicCatalog[sku]) return dynamicCatalog[sku].ean;
  return undefined;
}

export function catalogBrand(articleName: string): string | undefined {
  const sku = matchToCatalog(articleName);
  if (sku && dynamicCatalog[sku]) return dynamicCatalog[sku].brand;
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
