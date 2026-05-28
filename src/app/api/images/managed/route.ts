import { NextRequest, NextResponse } from "next/server";
import { findUploadedImageIdsByProduct } from "@/lib/db";

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const productId = url.searchParams.get("productId");
    const location = url.searchParams.get("location") ?? undefined;

    if (!productId) {
      return NextResponse.json(
        { error: "productId is required" },
        { status: 400 }
      );
    }

    const tracked = await findUploadedImageIdsByProduct({
      productId: Number(productId),
      location,
    });

    return NextResponse.json({
      managedUrls: tracked.map((t) => t.imageUrl),
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to fetch managed images";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
