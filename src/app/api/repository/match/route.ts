import { NextRequest } from "next/server";
import { sql } from "@/lib/db";

interface ProductInput {
  productId: number;
  productName: string | null;
  brandName: string | null;
  category: string | null;
  strain: string | null;
  strainType: string | null;
}

interface RuleRow {
  id: number;
  image_id: number;
  image_name: string;
  brand_name: string | null;
  category: string | null;
  strain: string | null;
  strain_type: string | null;
  product_name_keywords: string[] | null;
  priority: number;
  created_at: string;
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

export async function POST(req: NextRequest) {
  try {
    const { products } = (await req.json()) as { products: ProductInput[] };

    if (!products || !Array.isArray(products)) {
      return new Response(
        JSON.stringify({ error: "products array is required" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    const query = sql();

    // Fetch all rules once instead of N individual queries
    const allRules = (await query`
      SELECT r.id, r.image_id, ri.name as image_name, r.brand_name, r.category,
             r.strain, r.strain_type, r.product_name_keywords, r.priority, r.created_at
      FROM matching_rules r
      JOIN repository_images ri ON ri.id = r.image_id
      ORDER BY r.priority DESC, r.created_at ASC
    `) as unknown as RuleRow[];

    const results = products.map((p) => {
      // Find the best matching rule (already sorted by priority DESC, created_at ASC)
      const match = allRules.find(
        (r) =>
          ilike(p.brandName, r.brand_name) &&
          ilike(p.category, r.category) &&
          ilike(p.strain, r.strain) &&
          ilike(p.strainType, r.strain_type) &&
          keywordsMatch(p.productName, r.product_name_keywords)
      );

      return {
        productId: p.productId,
        productName: p.productName,
        matchedImageId: match?.image_id ?? null,
        matchedImageName: match?.image_name ?? null,
        matchedRuleId: match?.id ?? null,
      };
    });

    return Response.json(results);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to match products";
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
