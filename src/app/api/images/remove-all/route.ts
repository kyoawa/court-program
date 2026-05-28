import { NextRequest, NextResponse } from "next/server";
import { getProducts, removeImage } from "@/lib/dutchie-client";
import { extractImageIdFromUrl } from "@/lib/utils";
import { cacheDelete } from "@/lib/cache";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { productId } = body;

    if (!productId) {
      return NextResponse.json(
        { error: "productId is required" },
        { status: 400 }
      );
    }

    cacheDelete("products:all");
    const products = await getProducts({ isActive: true });
    const product = products.find((p) => p.productId === productId);

    if (!product) {
      return NextResponse.json(
        { error: "Product not found" },
        { status: 404 }
      );
    }

    const urls =
      product.imageUrls && product.imageUrls.length > 0
        ? product.imageUrls
        : product.imageUrl
        ? [product.imageUrl]
        : [];

    const results = {
      total: urls.length,
      removed: 0,
      failed: 0,
      errors: [] as string[],
    };

    for (const url of urls) {
      const imageId = extractImageIdFromUrl(url);
      if (!imageId) {
        results.failed++;
        results.errors.push(`Could not extract imageId from URL: ${url}`);
        continue;
      }
      try {
        await removeImage({
          productId,
          imageId: imageId as unknown as number,
        });
        results.removed++;
      } catch (err) {
        results.failed++;
        results.errors.push(
          err instanceof Error ? err.message : String(err)
        );
      }
    }

    cacheDelete("products:all");

    return NextResponse.json(results);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to remove all images";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
