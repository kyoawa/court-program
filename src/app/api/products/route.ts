import { NextRequest, NextResponse } from "next/server";
import { getCatalogProducts } from "@/lib/catalog";
import { getInventoryMap } from "@/lib/inventory";
import {
  FILTER_PARAM_KEYS,
  filterProducts,
  filtersFromParams,
  hasActiveFilters,
} from "@/lib/product-filters";
import type { ProductDetail } from "@/lib/types";

const DEFAULT_PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 500;

// OPTIONAL params for internal pagination/filtering. None of these touch the
// Dutchie call — they post-process the (cached) response only. The filter
// params are the same ones the browser-side filter bar uses (see
// lib/product-filters.ts), so filters apply before pagination.
const PAGINATION_PARAMS = ["page", "pageSize", "all", "multiImageOnly", ...FILTER_PARAM_KEYS];

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = req.nextUrl;
    const fromDate = searchParams.get("fromLastModifiedDateUTC") ?? undefined;
    const isActiveParam = searchParams.get("isActive");
    const isActive =
      isActiveParam === null ? undefined : isActiveParam === "true";

    // Fetch (or read from cache) the full Dutchie response. The cache key is
    // keyed ONLY on the Dutchie inputs so the payload is shared across every
    // pagination/filter combination.
    const products = await getCatalogProducts({
      fromLastModifiedDateUTC: fromDate,
      isActive,
    });

    // Backward compatibility: if no pagination/filter param is present, return
    // the raw array exactly as before (existing pages depend on this shape).
    const usesPagination = PAGINATION_PARAMS.some((p) =>
      searchParams.has(p)
    );
    if (!usesPagination) {
      const res = NextResponse.json(products);
      res.headers.set("Cache-Control", "private, max-age=300");
      return res;
    }

    const all = searchParams.get("all") === "true";
    const multiImageOnly = searchParams.get("multiImageOnly") === "true";
    const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10) || 1);
    const pageSize = Math.min(
      MAX_PAGE_SIZE,
      Math.max(
        1,
        parseInt(searchParams.get("pageSize") ?? String(DEFAULT_PAGE_SIZE), 10) ||
          DEFAULT_PAGE_SIZE
      )
    );

    const filters = filtersFromParams(searchParams);
    // Legacy alias kept for older links.
    if (multiImageOnly && filters.images === "all") filters.images = "multi";
    let filtered = products;
    if (hasActiveFilters(filters)) {
      const inventory = filters.stock !== "all" ? await getInventoryMap() : undefined;
      filtered = filterProducts(products, filters, inventory);
    }

    const total = filtered.length;
    let pageProducts: ProductDetail[];
    let hasMore: boolean;
    if (all) {
      pageProducts = filtered;
      hasMore = false;
    } else {
      const start = (page - 1) * pageSize;
      pageProducts = filtered.slice(start, start + pageSize);
      hasMore = start + pageSize < total;
    }

    const res = NextResponse.json({
      products: pageProducts,
      total,
      page: all ? 1 : page,
      pageSize: all ? total : pageSize,
      hasMore,
    });
    res.headers.set("Cache-Control", "private, max-age=300");
    return res;
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to fetch products";
    console.error("[API /products] Error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
