import { NextRequest, NextResponse } from "next/server";
import { getCatalogProducts } from "@/lib/catalog";
import { buildFacets } from "@/lib/product-filters";

/** Distinct categories, brands, vendors and strain types across the catalog. */
export async function GET(req: NextRequest) {
  try {
    const isActiveParam = req.nextUrl.searchParams.get("isActive");
    const products = await getCatalogProducts({
      isActive: isActiveParam === null ? undefined : isActiveParam === "true",
    });
    const res = NextResponse.json(buildFacets(products));
    res.headers.set("Cache-Control", "private, max-age=300");
    return res;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to fetch facets";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
