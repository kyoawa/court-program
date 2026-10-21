import { NextRequest } from "next/server";
import { ensureSchema, loadExclusions, loadMatchingRules, productsWithRepositoryImage } from "@/lib/db";
import { getCatalogProducts } from "@/lib/catalog";
import { getImageCount } from "@/lib/image-utils";
import { matchingRules } from "@/lib/matching";
import { createApplyStream, SSE_HEADERS } from "@/lib/repository-apply";

export const maxDuration = 300;

/**
 * Applies one repository image to the products its rules match. Without
 * overwrite only products with no images are touched; products that already
 * carry this image are always skipped. `productIds` narrows to a selection.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await ensureSchema();
    const imageId = Number((await params).id);
    if (!Number.isInteger(imageId) || imageId <= 0) {
      return new Response(JSON.stringify({ error: "Invalid image id" }), { status: 400, headers: { "Content-Type": "application/json" } });
    }
    const body = (await req.json().catch(() => ({}))) as { overwriteExisting?: boolean; location?: string; productIds?: number[] };
    const overwrite = body.overwriteExisting === true;
    const only = Array.isArray(body.productIds) ? new Set(body.productIds.map(Number)) : null;

    const rules = await loadMatchingRules(imageId);
    if (rules.length === 0) {
      return new Response(JSON.stringify({ error: "Image has no matching rules" }), { status: 400, headers: { "Content-Type": "application/json" } });
    }
    const exclusions = await loadExclusions([imageId]);
    const alreadyApplied = await productsWithRepositoryImage(imageId, body.location);
    const products = await getCatalogProducts({ isActive: true });

    const items = products
      .filter((p) => (!only || only.has(p.productId)) && !alreadyApplied.has(p.productId))
      .filter((p) => overwrite || getImageCount(p) === 0)
      .filter((p) => matchingRules(p, rules, exclusions).length > 0)
      .map((p) => ({ productId: p.productId, imageId, productName: p.productName }));

    if (items.length === 0) {
      return new Response(JSON.stringify({ error: overwrite ? "No products match (after exclusions)" : "No matching products are missing images. Turn on Overwrite to replace existing images." }), { status: 400, headers: { "Content-Type": "application/json" } });
    }
    return new Response(createApplyStream(items, { overwriteExisting: overwrite, location: body.location }), { headers: SSE_HEADERS });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to apply image";
    return new Response(JSON.stringify({ error: message }), { status: 500, headers: { "Content-Type": "application/json" } });
  }
}
