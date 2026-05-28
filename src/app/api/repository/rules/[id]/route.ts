import { NextRequest } from "next/server";
import { sql, ensureSchema } from "@/lib/db";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await ensureSchema();
    const { id } = await params;
    const ruleId = Number(id);
    if (!Number.isFinite(ruleId)) {
      return new Response(
        JSON.stringify({ error: "Invalid rule id" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    const body = (await req.json()) as {
      brandName?: string | null;
      category?: string | null;
      strain?: string | null;
      strainType?: string | null;
      productNameKeywords?: string[] | null;
      priority?: number;
    };

    const brandName = body.brandName || null;
    const category = body.category || null;
    const strain = body.strain || null;
    const strainType = body.strainType || null;
    const productNameKeywords =
      body.productNameKeywords && body.productNameKeywords.length > 0
        ? body.productNameKeywords
        : null;

    if (!brandName && !category && !strain && !strainType && !productNameKeywords) {
      return new Response(
        JSON.stringify({ error: "Rule must have at least one filter field" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    const fields = [brandName, category, strain, strainType, productNameKeywords];
    const autoP = fields.filter((f) => f != null).length;
    const priority = body.priority ?? autoP;

    const query = sql();
    const result = await query`
      UPDATE matching_rules
      SET brand_name = ${brandName},
          category = ${category},
          strain = ${strain},
          strain_type = ${strainType},
          product_name_keywords = ${productNameKeywords},
          priority = ${priority}
      WHERE id = ${ruleId}
      RETURNING id, image_id, brand_name, category, strain, strain_type, product_name_keywords, priority, created_at
    `;

    if (result.length === 0) {
      return new Response(
        JSON.stringify({ error: "Rule not found" }),
        { status: 404, headers: { "Content-Type": "application/json" } }
      );
    }

    const row = result[0];
    return Response.json({
      id: row.id,
      imageId: row.image_id,
      brandName: row.brand_name,
      category: row.category,
      strain: row.strain,
      strainType: row.strain_type,
      productNameKeywords: row.product_name_keywords ?? null,
      priority: row.priority,
      createdAt: row.created_at,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to update rule";
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const query = sql();

    await query`
      DELETE FROM matching_rules WHERE id = ${Number(id)}
    `;

    return Response.json({ success: true });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to delete rule";
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
