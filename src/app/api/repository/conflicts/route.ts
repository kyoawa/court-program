import { ensureSchema, loadExclusions, loadMatchingRules } from "@/lib/db";
import { getCatalogProducts } from "@/lib/catalog";
import { matchProducts } from "@/lib/matching";

export const dynamic = "force-dynamic";

export interface RuleConflict {
  productId: number;
  productName: string | null;
  brandName: string | null;
  winnerImageId: number;
  winnerImageName: string | null;
  otherImageIds: number[];
}

/** Active products whose rules match more than one repository image. */
export async function GET() {
  try {
    await ensureSchema();
    const [rules, exclusions, products] = await Promise.all([loadMatchingRules(), loadExclusions(), getCatalogProducts({ isActive: true })]);
    const names = new Map(rules.map((rule) => [rule.imageId, rule.imageName ?? null]));
    const conflicts: RuleConflict[] = matchProducts(products, rules, exclusions)
      .filter((outcome) => outcome.matchedImageId !== null && outcome.alternativeImageIds.length > 0)
      .map((outcome) => ({
        productId: outcome.productId,
        productName: outcome.productName,
        brandName: products.find((p) => p.productId === outcome.productId)?.brandName ?? null,
        winnerImageId: outcome.matchedImageId as number,
        winnerImageName: outcome.matchedImageName,
        otherImageIds: outcome.alternativeImageIds,
      }));
    return Response.json({ conflicts, imageNames: Object.fromEntries(names) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("[repository/conflicts] failed:", error);
    const message = error instanceof Error ? error.message : "Failed to find conflicts";
    return new Response(JSON.stringify({ error: message }), { status: 500, headers: { "Content-Type": "application/json" } });
  }
}
