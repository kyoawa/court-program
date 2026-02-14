import { NextRequest } from "next/server";
import { sql } from "@/lib/db";

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      imageId: number;
      brandName?: string | null;
      category?: string | null;
      strain?: string | null;
      strainType?: string | null;
      productNameContains?: string | null;
      priority?: number;
    };

    if (!body.imageId) {
      return new Response(
        JSON.stringify({ error: "imageId is required" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    const fields = [
      body.brandName,
      body.category,
      body.strain,
      body.strainType,
      body.productNameContains,
    ];
    const autoP = fields.filter((f) => f != null && f !== "").length;
    const priority = body.priority ?? autoP;

    const brandName = body.brandName || null;
    const category = body.category || null;
    const strain = body.strain || null;
    const strainType = body.strainType || null;
    const productNameContains = body.productNameContains || null;

    const query = sql();
    const result = await query`
      INSERT INTO matching_rules
        (image_id, brand_name, category, strain, strain_type, product_name_contains, priority)
      VALUES (${body.imageId}, ${brandName}, ${category}, ${strain}, ${strainType}, ${productNameContains}, ${priority})
      RETURNING id
    `;

    return Response.json({
      id: result[0].id,
      imageId: body.imageId,
      brandName,
      category,
      strain,
      strainType,
      productNameContains,
      priority,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to create rule";
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
