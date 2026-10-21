import { NextRequest } from "next/server";
import { ensureSchema, loadExclusions, loadMatchingRules } from "@/lib/db";
import { matchProducts, type MatchProduct } from "@/lib/matching";

/** Best repository image for each given product, honoring rule priority and exclusions. */
export async function POST(req: NextRequest) {
  try {
    const { products } = (await req.json()) as { products: MatchProduct[] };
    if (!products || !Array.isArray(products)) {
      return new Response(JSON.stringify({ error: "products array is required" }), { status: 400, headers: { "Content-Type": "application/json" } });
    }
    await ensureSchema();
    const [rules, exclusions] = await Promise.all([loadMatchingRules(), loadExclusions()]);
    return Response.json(matchProducts(products, rules, exclusions));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to match products";
    return new Response(JSON.stringify({ error: message }), { status: 500, headers: { "Content-Type": "application/json" } });
  }
}
