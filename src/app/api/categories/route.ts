import { NextResponse } from "next/server";
import { getCategories } from "@/lib/dutchie-client";
import { cacheGet, cacheSet } from "@/lib/cache";
import { CACHE_TTL } from "@/lib/constants";
import type { ProductCategory } from "@/lib/types";

export async function GET() {
  try {
    const cached = cacheGet<ProductCategory[]>("categories");
    if (cached) {
      const res = NextResponse.json(cached);
      res.headers.set("Cache-Control", "private, max-age=3600");
      return res;
    }

    const categories = await getCategories();
    cacheSet("categories", categories, CACHE_TTL.categories);

    const res = NextResponse.json(categories);
    res.headers.set("Cache-Control", "private, max-age=3600");
    return res;
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to fetch categories";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
