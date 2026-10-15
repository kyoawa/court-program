import { NextRequest, NextResponse } from "next/server";
import { removeImage } from "@/lib/dutchie-client";
import { cacheDelete } from "@/lib/cache";
import { deleteUploadedImageRecord, findUploadedImageId } from "@/lib/db";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { productId, imageUrl, location, imageId: providedImageId } = body;

    if (!productId || (!imageUrl && !providedImageId)) {
      return NextResponse.json(
        { error: "productId and (imageUrl or imageId) are required" },
        { status: 400 }
      );
    }

    let imageId: number | null = providedImageId ?? null;

    if (!imageId && imageUrl) {
      imageId = await findUploadedImageId({
        productId: Number(productId),
        imageUrl,
        location,
      });
    }

    if (!imageId) {
      return NextResponse.json(
        {
          error: "unmanaged_image",
          message:
            "The image ID is unavailable, so this image cannot be deleted through the app. It can still be removed in Dutchie Backoffice.",
        },
        { status: 422 }
      );
    }

    const result = await removeImage({
      productId: Number(productId),
      imageId: Number(imageId),
    });

    if (!result.result) {
      return NextResponse.json({ error: result.message || "Dutchie did not delete the image." }, { status: 502 });
    }

    try {
      await deleteUploadedImageRecord({
        productId: Number(productId),
        imageId: Number(imageId),
        location,
      });
    } catch (err) {
      console.error("[images/remove] Failed to delete tracking record:", err);
    }

    cacheDelete("products:all");

    return NextResponse.json(result);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to remove image";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
