import { getProducts } from "./dutchie-client";
import { cacheGet, cacheSet } from "./cache";
import { CACHE_TTL, RETAIL_STORES, type StoreName } from "./constants";
import type { InventoryMap } from "./types";

const CACHE_KEY = "inventory:map";

/**
 * Map of productId -> retail stores where the product is active. One Dutchie
 * catalog read per store, cached so filters and the Stores column share it.
 */
export async function getInventoryMap(): Promise<InventoryMap> {
  const cached = cacheGet<InventoryMap>(CACHE_KEY);
  if (cached) return cached;

  const results = await Promise.allSettled(
    RETAIL_STORES.map(async (storeName: StoreName) => {
      const products = await getProducts({ isActive: true, store: storeName });
      return { storeName, productIds: products.map((p) => p.productId) };
    })
  );

  const inventoryMap: InventoryMap = {};
  for (const result of results) {
    if (result.status === "fulfilled") {
      const { storeName, productIds } = result.value;
      for (const id of productIds) {
        (inventoryMap[id] ??= []).push(storeName);
      }
    } else {
      console.error("[inventory] Store query failed:", result.reason?.message ?? "Unknown error");
    }
  }

  cacheSet(CACHE_KEY, inventoryMap, CACHE_TTL.inventory);
  return inventoryMap;
}
