import type { InventoryMap, ProductDetail } from "./types";
import { getImageCount } from "./image-utils";
import { RETAIL_STORES } from "./constants";

/**
 * One filter model shared by every product list (upload, missing images,
 * recent, all products) and by the /api/products route, so a filter behaves
 * the same whether it runs in the browser or before server pagination.
 */
export type ImageFilter = "all" | "none" | "any" | "multi";
export type DescriptionFilter = "all" | "missing" | "has";

export interface ProductFilters {
  /** Free-text keyword query; see parseQuery for the grammar. */
  query: string;
  category: string;
  brand: string;
  vendor: string;
  strainType: string;
  /** "all" | "any" (in stock somewhere) | "none" (no store) | a store name. */
  stock: string;
  images: ImageFilter;
  description: DescriptionFilter;
}

export const ALL = "all";

export const EMPTY_FILTERS: ProductFilters = {
  query: "",
  category: ALL,
  brand: ALL,
  vendor: ALL,
  strainType: ALL,
  stock: ALL,
  images: ALL,
  description: ALL,
};

const IMAGE_FILTERS: ImageFilter[] = ["all", "none", "any", "multi"];
const DESCRIPTION_FILTERS: DescriptionFilter[] = ["all", "missing", "has"];

export function formatStoreName(name: string): string {
  return name.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export const STOCK_OPTIONS: { value: string; label: string }[] = [
  { value: "any", label: "In stock (any store)" },
  { value: "none", label: "Not in any store" },
  ...RETAIL_STORES.map((store) => ({ value: store, label: `In stock: ${formatStoreName(store)}` })),
];

export const IMAGE_OPTIONS: { value: ImageFilter; label: string }[] = [
  { value: "none", label: "No images" },
  { value: "any", label: "Has images" },
  { value: "multi", label: "Multiple images" },
];

export const DESCRIPTION_OPTIONS: { value: DescriptionFilter; label: string }[] = [
  { value: "missing", label: "Missing description" },
  { value: "has", label: "Has description" },
];

export function countActiveFilters(filters: ProductFilters): number {
  return (Object.keys(EMPTY_FILTERS) as (keyof ProductFilters)[]).filter(
    (key) => (filters[key] ?? EMPTY_FILTERS[key]) !== EMPTY_FILTERS[key] && !(key === "query" && !filters.query.trim()),
  ).length;
}

export function hasActiveFilters(filters: ProductFilters): boolean {
  return countActiveFilters(filters) > 0;
}

/* ----------------------------- keyword search ----------------------------- */

/**
 * Query grammar (case-insensitive, every term must match):
 *   blue dream        each word must appear in some searchable field
 *   "blue dream"      the phrase must appear together
 *   -sample           exclude products containing the word
 *   brand:kiva        restrict a term to one field (see QUERY_FIELDS)
 *   vendor:"lost farm"
 */
export interface QueryTerm {
  text: string;
  field?: string;
  negate: boolean;
}

type FieldReader = (product: ProductDetail) => (string | number | null | undefined)[];

export const QUERY_FIELDS: Record<string, FieldReader> = {
  name: (p) => [p.productName, p.internalName],
  sku: (p) => [p.sku],
  brand: (p) => [p.brandName],
  vendor: (p) => [p.vendorName],
  strain: (p) => [p.strain],
  type: (p) => [p.strainType],
  category: (p) => [p.category, p.masterCategory],
  size: (p) => [p.size],
  id: (p) => [p.productId, p.globalProductId],
  desc: (p) => [p.description, p.onlineDescription],
};

/** Fields searched by an unqualified term. Descriptions are opt-in via desc:. */
const FREE_TEXT_FIELDS = ["name", "sku", "brand", "vendor", "strain", "type", "category", "size", "id"];

const TERM_PATTERN = /(-)?(?:([a-z]+):)?(?:"([^"]*)"|([^\s"]+))/gi;

export function parseQuery(query: string): QueryTerm[] {
  const terms: QueryTerm[] = [];
  for (const match of query.matchAll(TERM_PATTERN)) {
    const [, negate, rawField, phrase, word] = match;
    const field = rawField?.toLowerCase();
    const knownField = field && field in QUERY_FIELDS ? field : undefined;
    // An unknown prefix such as "re:order" is searched literally.
    const text = (knownField ? (phrase ?? word ?? "") : (phrase ?? `${rawField ? `${rawField}:` : ""}${word ?? ""}`))
      .toLowerCase().replace(/\s+/g, " ").trim();
    if (!text) continue;
    terms.push({ text, field: knownField, negate: Boolean(negate) });
  }
  return terms;
}

function haystack(product: ProductDetail, field?: string): string {
  const fields = field ? [field] : FREE_TEXT_FIELDS;
  return fields
    .flatMap((name) => QUERY_FIELDS[name](product))
    .filter((value) => value !== null && value !== undefined && value !== "")
    .map((value) => String(value).toLowerCase())
    .join("\n");
}

export function matchesQuery(product: ProductDetail, terms: QueryTerm[]): boolean {
  return terms.every((term) => {
    const hit = term.field === "id"
      ? QUERY_FIELDS.id(product).some((value) => String(value ?? "").toLowerCase() === term.text)
      : haystack(product, term.field).includes(term.text);
    return term.negate ? !hit : hit;
  });
}

/* ------------------------------- filtering ------------------------------- */

function inStock(inventory: InventoryMap | undefined, productId: number): string[] {
  return inventory?.[productId] ?? [];
}

export function filterProducts(
  products: ProductDetail[],
  filters: ProductFilters,
  inventory?: InventoryMap,
): ProductDetail[] {
  const terms = parseQuery(filters.query ?? "");
  const description = (value: string | null) => Boolean(value && value.trim());
  return products.filter((product) => {
    if (filters.category !== ALL && product.category !== filters.category) return false;
    if (filters.brand !== ALL && product.brandName !== filters.brand) return false;
    if (filters.vendor !== ALL && product.vendorName !== filters.vendor) return false;
    if (filters.strainType !== ALL && product.strainType !== filters.strainType) return false;
    if (filters.images !== ALL) {
      const count = getImageCount(product);
      if (filters.images === "none" && count !== 0) return false;
      if (filters.images === "any" && count === 0) return false;
      if (filters.images === "multi" && count < 2) return false;
    }
    if (filters.description !== ALL) {
      const has = description(product.onlineDescription);
      if (filters.description === "missing" ? has : !has) return false;
    }
    if (filters.stock !== ALL) {
      const stores = inStock(inventory, product.productId);
      if (filters.stock === "any" && stores.length === 0) return false;
      if (filters.stock === "none" && stores.length > 0) return false;
      if (filters.stock !== "any" && filters.stock !== "none" && !stores.includes(filters.stock)) return false;
    }
    return terms.length === 0 || matchesQuery(product, terms);
  });
}

/* ------------------------------ URL encoding ------------------------------ */

const PARAM_KEYS: Record<keyof ProductFilters, string> = {
  query: "q",
  category: "category",
  brand: "brand",
  vendor: "vendor",
  strainType: "strainType",
  stock: "stock",
  images: "images",
  description: "description",
};

export const FILTER_PARAM_KEYS = Object.values(PARAM_KEYS);

export function filtersToParams(filters: ProductFilters, params = new URLSearchParams()): URLSearchParams {
  for (const [key, param] of Object.entries(PARAM_KEYS) as [keyof ProductFilters, string][]) {
    const value = filters[key];
    if (value && value !== EMPTY_FILTERS[key]) params.set(param, value);
  }
  return params;
}

export function filtersFromParams(params: URLSearchParams): ProductFilters {
  const read = (key: keyof ProductFilters) => params.get(PARAM_KEYS[key])?.trim() || EMPTY_FILTERS[key];
  const images = read("images");
  const description = read("description");
  const stock = read("stock");
  const validStock = stock === ALL || stock === "any" || stock === "none" || (RETAIL_STORES as string[]).includes(stock);
  return {
    query: read("query"),
    category: read("category"),
    brand: read("brand"),
    vendor: read("vendor"),
    strainType: read("strainType"),
    stock: validStock ? stock : ALL,
    images: (IMAGE_FILTERS as string[]).includes(images) ? (images as ImageFilter) : ALL,
    description: (DESCRIPTION_FILTERS as string[]).includes(description) ? (description as DescriptionFilter) : ALL,
  };
}

/* -------------------------------- facets --------------------------------- */

export interface ProductFacets {
  categories: string[];
  brands: string[];
  vendors: string[];
  strainTypes: string[];
}

function distinct(values: (string | null | undefined)[]): string[] {
  return Array.from(new Set(values.filter((v): v is string => Boolean(v && v.trim())))).sort((a, b) => a.localeCompare(b));
}

export function buildFacets(products: ProductDetail[]): ProductFacets {
  return {
    categories: distinct(products.map((p) => p.category)),
    brands: distinct(products.map((p) => p.brandName)),
    vendors: distinct(products.map((p) => p.vendorName)),
    strainTypes: distinct(products.map((p) => p.strainType)),
  };
}
