import { NextRequest } from "next/server";

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      brandName?: string | null;
      category?: string | null;
      strain?: string | null;
      strainType?: string | null;
      productNameKeywords?: string[] | null;
    };

    const brandName = body.brandName || null;
    const category = body.category || null;
    const strain = body.strain || null;
    const strainType = body.strainType || null;
    const keywords =
      body.productNameKeywords && body.productNameKeywords.length > 0
        ? body.productNameKeywords
        : null;

    if (!brandName && !category && !strain && !strainType && !keywords) {
      return Response.json({ matchCount: 0, sampleProducts: [] });
    }

    const baseUrl = req.nextUrl.origin;
    const productsRes = await fetch(`${baseUrl}/api/products?isActive=true`, {
      headers: { Cookie: req.headers.get("cookie") || "" },
    });

    if (!productsRes.ok) {
      return Response.json({ matchCount: 0, sampleProducts: [] });
    }

    const products = (await productsRes.json()) as Array<{
      productId: number;
      productName: string | null;
      brandName: string | null;
      category: string | null;
      strain: string | null;
      strainType: string | null;
    }>;

    // Match in JS using same logic as the match route
    const matched = products.filter((p) => {
      if (brandName && !(p.brandName && p.brandName.toLowerCase() === brandName.toLowerCase())) {
        return false;
      }
      if (category && !(p.category && p.category.toLowerCase() === category.toLowerCase())) {
        return false;
      }
      if (strain && !(p.strain && p.strain.toLowerCase() === strain.toLowerCase())) {
        return false;
      }
      if (strainType && !(p.strainType && p.strainType.toLowerCase() === strainType.toLowerCase())) {
        return false;
      }
      if (keywords) {
        const name = (p.productName ?? "").toLowerCase();
        if (!keywords.every((kw) => name.includes(kw.toLowerCase()))) {
          return false;
        }
      }
      return true;
    });

    return Response.json({
      matchCount: matched.length,
      sampleProducts: matched.map((p) => ({
        id: p.productId,
        name: p.productName ?? "Unknown",
        brandName: p.brandName,
        category: p.category,
      })),
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to preview matches";
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
