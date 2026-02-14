import { NextRequest, NextResponse } from "next/server";
import { removeImage } from "@/lib/dutchie-client";
import { cacheDelete } from "@/lib/cache";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { productId, imageId } = body;

    if (!productId || !imageId) {
      return NextResponse.json(
        { error: "productId and imageId are required" },
        { status: 400 }
      );
    }

    const result = await removeImage({ productId, imageId });

    cacheDelete("products:all");

    return NextResponse.json(result);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to remove image";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
