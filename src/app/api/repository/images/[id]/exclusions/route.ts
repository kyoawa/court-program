import { NextRequest } from "next/server";
import { sql, ensureSchema } from "@/lib/db";

export async function PATCH(
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

    const body = (await req.json()) as { excludedProductIds: number[] };
    if (!Array.isArray(body.excludedProductIds)) {
      return new Response(
        JSON.stringify({ error: "excludedProductIds must be an array" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    const ids = body.excludedProductIds
      .map((n) => Number(n))
      .filter((n) => Number.isFinite(n));

    const query = sql();
    const result = await query`
      UPDATE repository_images
      SET excluded_product_ids = ${ids}::INTEGER[],
          updated_at = NOW()
      WHERE id = ${imageId}
      RETURNING id, COALESCE(excluded_product_ids, '{}'::INTEGER[]) as excluded_product_ids
    `;

    if (result.length === 0) {
      return new Response(
        JSON.stringify({ error: "Image not found" }),
        { status: 404, headers: { "Content-Type": "application/json" } }
      );
    }

    return Response.json({
      id: result[0].id,
      excludedProductIds: result[0].excluded_product_ids ?? [],
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to update exclusions";
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
