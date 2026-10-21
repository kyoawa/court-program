import { NextRequest } from "next/server";
import { sql, ensureSchema } from "@/lib/db";

type BulkBody =
  | { action: "delete"; ids: number[] }
  | { action: "group"; ids: number[]; groupName: string | null }
  | {
      action: "rule";
      ids: number[];
      rule: { brandName?: string | null; category?: string | null; strain?: string | null; strainType?: string | null; productNameKeywords?: string[] | null; priority?: number };
    };

/** Bulk operations over selected repository images: delete, move to a group, or add the same rule to each. */
export async function POST(req: NextRequest) {
  try {
    await ensureSchema();
    const body = (await req.json()) as BulkBody;
    const ids = Array.isArray(body?.ids) ? body.ids.map(Number).filter((n) => Number.isInteger(n) && n > 0) : [];
    if (!ids.length || ids.length > 1000) {
      return new Response(JSON.stringify({ error: "Select between 1 and 1000 images." }), { status: 400, headers: { "Content-Type": "application/json" } });
    }
    const query = sql();
    if (body.action === "delete") {
      const rows = await query`DELETE FROM repository_images WHERE id = ANY(${ids}::INTEGER[]) RETURNING id`;
      return Response.json({ affected: rows.length });
    }
    if (body.action === "group") {
      const group = body.groupName?.trim() || null;
      const rows = await query`UPDATE repository_images SET group_name = ${group}, updated_at = NOW() WHERE id = ANY(${ids}::INTEGER[]) RETURNING id`;
      return Response.json({ affected: rows.length });
    }
    if (body.action === "rule") {
      const rule = body.rule ?? {};
      const brandName = rule.brandName || null;
      const category = rule.category || null;
      const strain = rule.strain || null;
      const strainType = rule.strainType || null;
      const keywords = rule.productNameKeywords?.length ? rule.productNameKeywords : null;
      if (!brandName && !category && !strain && !strainType && !keywords) {
        return new Response(JSON.stringify({ error: "Rule must have at least one filter field" }), { status: 400, headers: { "Content-Type": "application/json" } });
      }
      const priority = rule.priority ?? [brandName, category, strain, strainType, keywords].filter((f) => f != null).length;
      let affected = 0;
      for (const id of ids) {
        const rows = await query`
          INSERT INTO matching_rules (image_id, brand_name, category, strain, strain_type, product_name_keywords, priority)
          SELECT ${id}, ${brandName}, ${category}, ${strain}, ${strainType}, ${keywords}, ${priority}
          WHERE EXISTS (SELECT 1 FROM repository_images WHERE id = ${id})
          RETURNING id
        `;
        affected += rows.length;
      }
      return Response.json({ affected });
    }
    return new Response(JSON.stringify({ error: "Unknown action" }), { status: 400, headers: { "Content-Type": "application/json" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Bulk operation failed";
    return new Response(JSON.stringify({ error: message }), { status: 500, headers: { "Content-Type": "application/json" } });
  }
}
