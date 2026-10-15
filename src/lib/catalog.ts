import { getProducts } from "./dutchie-client";
import { cacheGet, cacheSet } from "./cache";
import { CACHE_TTL } from "./constants";
import type { ProductDetail } from "./types";

/**
 * Cached Dutchie catalog read. The cache key depends only on the Dutchie
 * inputs so every page, filter and facet request shares one payload.
 */
export async function getCatalogProducts(params: {
  fromLastModifiedDateUTC?: string;
  isActive?: boolean;
} = {}): Promise<ProductDetail[]> {
  const cacheKey = params.fromLastModifiedDateUTC
    ? `products:from:${params.fromLastModifiedDateUTC}`
    : "products:all";
  let products = cacheGet<ProductDetail[]>(cacheKey);
  if (!products) {
    products = await getProducts(params);
    cacheSet(cacheKey, products, CACHE_TTL.products);
  }
  return products;
}
