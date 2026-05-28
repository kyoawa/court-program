import { NextRequest } from "next/server";
import { sql } from "@/lib/db";

interface RuleRow {
  id: number;
  brand_name: string | null;
  category: string | null;
  strain: string | null;
  strain_type: string | null;
  product_name_keywords: string[] | null;
}

interface ProductRow {
  productId: number;
  productName: string | null;
  brandName: string | null;
  category: string | null;
  strain: string | null;
  strainType: string | null;
}

function ilike(value: string | null, pattern: string | null): boolean {
  if (pattern === null) return true;
  if (value === null) return false;
  return value.toLowerCase() === pattern.toLowerCase();
}

function keywordsMatch(productName: string | null, keywords: string[] | null): boolean {
  if (keywords === null) return true;
  if (!productName) return false;
  const lower = productName.toLowerCase();
  return keywords.every((kw) => lower.includes(kw.toLowerCase()));
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const imageId = Number(id);
    if (!Number.isFinite(imageId)) {
      return new Response(
        JSON.stringify({ error: "Invalid image id" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    const query = sql();

    const imageRows = (await query`
      SELECT COALESCE(excluded_product_ids, '{}'::INTEGER[]) as excluded_product_ids
      FROM repository_images
      WHERE id = ${imageId}
    `) as { excluded_product_ids: number[] }[];

    if (imageRows.length === 0) {
      return new Response(
        JSON.stringify({ error: "Image not found" }),
        { status: 404, headers: { "Content-Type": "application/json" } }
      );
    }

    const excluded = new Set<number>(imageRows[0].excluded_product_ids ?? []);

    const rules = (await query`
      SELECT id, brand_name, category, strain, strain_type, product_name_keywords
      FROM matching_rules
      WHERE image_id = ${imageId}
    `) as unknown as RuleRow[];

    if (rules.length === 0) {
      return Response.json({
        imageId,
        matchCount: 0,
        excludedCount: 0,
        applyCount: 0,
        excludedProductIds: Array.from(excluded),
        matches: [],
      });
    }

    const baseUrl = req.nextUrl.origin;
    const productsRes = await fetch(`${baseUrl}/api/products?isActive=true`, {
      headers: { Cookie: req.headers.get("cookie") || "" },
    });

    if (!productsRes.ok) {
      return Response.json({
        imageId,
        matchCount: 0,
        excludedCount: 0,
        applyCount: 0,
        excludedProductIds: Array.from(excluded),
        matches: [],
      });
    }

    const products = (await productsRes.json()) as ProductRow[];

    const matched = products.filter((p) =>
      rules.some(
        (r) =>
          ilike(p.brandName, r.brand_name) &&
          ilike(p.category, r.category) &&
          ilike(p.strain, r.strain) &&
          ilike(p.strainType, r.strain_type) &&
          keywordsMatch(p.productName, r.product_name_keywords)
      )
    );

    const matches = matched.map((p) => ({
      productId: p.productId,
      productName: p.productName,
      brandName: p.brandName,
      category: p.category,
      strain: p.strain,
      strainType: p.strainType,
      excluded: excluded.has(p.productId),
    }));

    const excludedCount = matches.filter((m) => m.excluded).length;

    return Response.json({
      imageId,
      matchCount: matches.length,
      excludedCount,
      applyCount: matches.length - excludedCount,
      excludedProductIds: Array.from(excluded),
      matches,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to preview matches";
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
