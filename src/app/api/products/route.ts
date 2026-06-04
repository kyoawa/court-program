import { NextRequest, NextResponse } from "next/server";
import { getProducts } from "@/lib/dutchie-client";
import { cacheGet, cacheSet } from "@/lib/cache";
import { CACHE_TTL } from "@/lib/constants";
import { getImageCount } from "@/lib/image-utils";
import type { ProductDetail } from "@/lib/types";

const DEFAULT_PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 500;

// New, OPTIONAL params for internal pagination/filtering. None of these touch
// the Dutchie call — they post-process the (cached) response only.
const PAGINATION_PARAMS = ["page", "pageSize", "all", "multiImageOnly"] as const;

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
    const cacheKey = fromDate ? `products:from:${fromDate}` : "products:all";
    let products = cacheGet<ProductDetail[]>(cacheKey);
    if (!products) {
      products = await getProducts({
        fromLastModifiedDateUTC: fromDate,
        isActive,
      });
      cacheSet(cacheKey, products, CACHE_TTL.products);
    }

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

    let filtered = products;
    if (multiImageOnly) {
      filtered = filtered.filter((p) => getImageCount(p) >= 2);
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
