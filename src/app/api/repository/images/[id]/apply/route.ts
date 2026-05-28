import { NextRequest } from "next/server";
import { sql, ensureSchema } from "@/lib/db";

interface RuleRow {
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

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await ensureSchema();
    const { id } = await params;
    const imageId = Number(id);
    if (!Number.isFinite(imageId)) {
      return new Response(
        JSON.stringify({ error: "Invalid image id" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    const body = (await req.json().catch(() => ({}))) as {
      overwriteExisting?: boolean;
      location?: string;
    };

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
      SELECT brand_name, category, strain, strain_type, product_name_keywords
      FROM matching_rules
      WHERE image_id = ${imageId}
    `) as unknown as RuleRow[];

    if (rules.length === 0) {
      return new Response(
        JSON.stringify({ error: "Image has no matching rules" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    const baseUrl = req.nextUrl.origin;
    const cookie = req.headers.get("cookie") || "";
    const productsRes = await fetch(`${baseUrl}/api/products?isActive=true`, {
      headers: { Cookie: cookie },
    });

    if (!productsRes.ok) {
      return new Response(
        JSON.stringify({ error: "Failed to load products" }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    const products = (await productsRes.json()) as ProductRow[];

    const matched = products.filter(
      (p) =>
        !excluded.has(p.productId) &&
        // only apply to products missing images
        rules.some(
          (r) =>
            ilike(p.brandName, r.brand_name) &&
            ilike(p.category, r.category) &&
            ilike(p.strain, r.strain) &&
            ilike(p.strainType, r.strain_type) &&
            keywordsMatch(p.productName, r.product_name_keywords)
        )
    );

    if (matched.length === 0) {
      return new Response(
        JSON.stringify({ error: "No products match (after exclusions)" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    const items = matched.map((p) => ({
      productId: p.productId,
      imageId,
      productName: p.productName ?? undefined,
    }));

    const applyRes = await fetch(`${baseUrl}/api/repository/apply`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: cookie,
      },
      body: JSON.stringify({
        items,
        overwriteExisting: body.overwriteExisting === true,
        location: body.location,
      }),
    });

    if (!applyRes.ok || !applyRes.body) {
      const errBody = await applyRes.text().catch(() => "");
      return new Response(errBody || JSON.stringify({ error: "Apply failed" }), {
        status: applyRes.status,
        headers: { "Content-Type": "application/json" },
      });
    }

    return new Response(applyRes.body, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to apply image";
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
