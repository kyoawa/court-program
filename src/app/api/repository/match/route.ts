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

    const results = await Promise.all(
      products.map(async (p) => {
        const rows = await query`
          SELECT r.id as rule_id, r.image_id, ri.name as image_name, r.priority
          FROM matching_rules r
          JOIN repository_images ri ON ri.id = r.image_id
          WHERE (r.brand_name IS NULL OR r.brand_name = ${p.brandName})
            AND (r.category IS NULL OR r.category = ${p.category})
            AND (r.strain IS NULL OR r.strain = ${p.strain})
            AND (r.strain_type IS NULL OR r.strain_type = ${p.strainType})
            AND (r.product_name_keywords IS NULL OR (
              SELECT bool_and(${p.productName ?? ""} ILIKE '%' || kw || '%')
              FROM unnest(r.product_name_keywords) AS kw
            ))
          ORDER BY r.priority DESC
          LIMIT 1
        `;

        const match = rows[0];
        return {
          productId: p.productId,
          productName: p.productName,
          matchedImageId: match?.image_id ?? null,
          matchedImageName: match?.image_name ?? null,
          matchedRuleId: match?.rule_id ?? null,
        };
      })
    );

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
