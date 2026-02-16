import { NextResponse } from "next/server";
import { getProducts } from "@/lib/dutchie-client";
import { cacheGet, cacheSet } from "@/lib/cache";
import { CACHE_TTL, RETAIL_STORES, type StoreName } from "@/lib/constants";
import type { InventoryMap } from "@/lib/types";

const CACHE_KEY = "inventory:map";

export async function GET() {
  try {
    const cached = cacheGet<InventoryMap>(CACHE_KEY);
    if (cached) {
      return NextResponse.json(cached, {
        headers: { "Cache-Control": "private, max-age=300" },
      });
    }

    const results = await Promise.allSettled(
      RETAIL_STORES.map(async (storeName: StoreName) => {
        const products = await getProducts({
          isActive: true,
          store: storeName,
        });
        return {
          storeName,
          productIds: products.map((p) => p.productId),
        };
      })
    );

    const inventoryMap: InventoryMap = {};

    for (const result of results) {
      if (result.status === "fulfilled") {
        const { storeName, productIds } = result.value;
        for (const id of productIds) {
          if (!inventoryMap[id]) {
            inventoryMap[id] = [];
          }
          inventoryMap[id].push(storeName);
        }
      } else {
        console.error(
          "[inventory] Store query failed:",
          result.reason?.message ?? "Unknown error"
        );
      }
    }

    cacheSet(CACHE_KEY, inventoryMap, CACHE_TTL.inventory);

    return NextResponse.json(inventoryMap, {
      headers: { "Cache-Control": "private, max-age=300" },
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to fetch inventory";
    console.error("[inventory] Error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
