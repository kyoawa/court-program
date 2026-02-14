import { NextRequest, NextResponse } from "next/server";
import { getProducts } from "@/lib/dutchie-client";
import { cacheGet, cacheSet } from "@/lib/cache";
import { CACHE_TTL } from "@/lib/constants";
import type { ProductDetail } from "@/lib/types";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = req.nextUrl;
    const fromDate = searchParams.get("fromLastModifiedDateUTC") ?? undefined;
    const isActiveParam = searchParams.get("isActive");
    const isActive =
      isActiveParam === null ? undefined : isActiveParam === "true";

    const cacheKey = fromDate ? `products:from:${fromDate}` : "products:all";
    const cached = cacheGet<ProductDetail[]>(cacheKey);
    if (cached) {
      const res = NextResponse.json(cached);
      res.headers.set("Cache-Control", "private, max-age=300");
      return res;
    }

    const products = await getProducts({
      fromLastModifiedDateUTC: fromDate,
      isActive,
    });

    cacheSet(cacheKey, products, CACHE_TTL.products);

    const res = NextResponse.json(products);
    res.headers.set("Cache-Control", "private, max-age=300");
    return res;
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to fetch products";
    console.error("[API /products] Error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
