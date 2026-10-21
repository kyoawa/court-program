import { NextRequest } from "next/server";
import { ensureSchema, loadExclusions, loadMatchingRules, productsWithRepositoryImage } from "@/lib/db";
import { getCatalogProducts } from "@/lib/catalog";
import { getImageCount } from "@/lib/image-utils";
import { matchingRules, matchProduct, sortRules } from "@/lib/matching";

export const dynamic = "force-dynamic";

export interface PreviewMatch {
  productId: number;
  productName: string | null;
  brandName: string | null;
  category: string | null;
  strain: string | null;
  strainType: string | null;
  excluded: boolean;
  /** Images the product already has in Dutchie. */
  imageCount: number;
  /** This image has already been applied to the product through the app. */
  alreadyApplied: boolean;
  /** The image that actually wins for this product when every rule is considered. */
  winnerImageId: number | null;
  winnerImageName: string | null;
}

/** Products this image's rules match, with what would really happen on apply. */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await ensureSchema();
    const imageId = Number((await params).id);
    if (!Number.isInteger(imageId) || imageId <= 0) {
      return new Response(JSON.stringify({ error: "Invalid image id" }), { status: 400, headers: { "Content-Type": "application/json" } });
    }
    const allRules = sortRules(await loadMatchingRules());
    const ownRules = allRules.filter((rule) => rule.imageId === imageId);
    const exclusions = await loadExclusions();
    const excluded = exclusions.get(imageId) ?? new Set<number>();
    if (!exclusions.has(imageId)) {
      return new Response(JSON.stringify({ error: "Image not found" }), { status: 404, headers: { "Content-Type": "application/json" } });
    }
    const empty = { imageId, matchCount: 0, excludedCount: 0, applyCount: 0, missingCount: 0, excludedProductIds: Array.from(excluded), matches: [] as PreviewMatch[] };
    if (ownRules.length === 0) return Response.json(empty);

    const applied = await productsWithRepositoryImage(imageId);
    const products = await getCatalogProducts({ isActive: true });
    const matches: PreviewMatch[] = products
      .filter((p) => ownRules.some((rule) => matchingRules(p, [rule]).length > 0))
      .map((p) => {
        const winner = matchProduct(p, allRules, exclusions);
        return {
          productId: p.productId,
          productName: p.productName,
          brandName: p.brandName,
          category: p.category,
          strain: p.strain,
          strainType: p.strainType,
          excluded: excluded.has(p.productId),
          imageCount: getImageCount(p),
          alreadyApplied: applied.has(p.productId),
          winnerImageId: winner.matchedImageId,
          winnerImageName: winner.matchedImageName,
        };
      });
    const excludedCount = matches.filter((m) => m.excluded).length;
    const applicable = matches.filter((m) => !m.excluded && !m.alreadyApplied);
    return Response.json({
      imageId,
      matchCount: matches.length,
      excludedCount,
      applyCount: applicable.length,
      missingCount: applicable.filter((m) => m.imageCount === 0).length,
      excludedProductIds: Array.from(excluded),
      matches,
    });
  } catch (error) {
    console.error("[repository/preview] failed:", error);
    const message = error instanceof Error ? error.message : "Failed to preview matches";
    return new Response(JSON.stringify({ error: message }), { status: 500, headers: { "Content-Type": "application/json" } });
  }
}
