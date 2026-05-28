import { NextRequest, NextResponse } from "next/server";
import { setImage } from "@/lib/dutchie-client";
import { cacheDelete } from "@/lib/cache";
import { recordUploadedImage } from "@/lib/db";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { productId, base64Image, fileName, location } = body;

    if (!productId || !base64Image) {
      return NextResponse.json(
        { error: "productId and base64Image are required" },
        { status: 400 }
      );
    }

    const result = await setImage({
      productId,
      base64Image,
      fileName: fileName ?? "image.jpg",
    });

    if (result.imageId && result.imageUrl) {
      try {
        await recordUploadedImage({
          productId: Number(productId),
          imageId: result.imageId,
          imageUrl: result.imageUrl,
          location,
        });
      } catch (err) {
        console.error("[images/set] Failed to record uploaded image:", err);
      }
    }

    cacheDelete("products:all");

    return NextResponse.json(result);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to set image";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
