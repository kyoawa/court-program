import { NextRequest, NextResponse } from "next/server";
import { getProducts, removeImage } from "@/lib/dutchie-client";
import { cacheDelete } from "@/lib/cache";
import {
  deleteUploadedImageRecord,
  findUploadedImageIdsByProduct,
} from "@/lib/db";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { productId, location } = body;

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

    const tracked = await findUploadedImageIdsByProduct({
      productId: Number(productId),
      location,
    });
    const trackedByUrl = new Map(tracked.map((t) => [t.imageUrl, t.imageId]));

    const results = {
      total: urls.length,
      removed: 0,
      failed: 0,
      unmanaged: 0,
      errors: [] as string[],
    };

    for (const url of urls) {
      const trackedId = trackedByUrl.get(url);
      if (!trackedId) {
        results.unmanaged++;
        continue;
      }
      try {
        await removeImage({
          productId: Number(productId),
          imageId: trackedId,
        });
        try {
          await deleteUploadedImageRecord({
            productId: Number(productId),
            imageId: trackedId,
            location,
          });
        } catch (err) {
          console.error(
            "[images/remove-all] Failed to delete tracking record:",
            err
          );
        }
        results.removed++;
      } catch (err) {
        results.failed++;
        results.errors.push(err instanceof Error ? err.message : String(err));
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
