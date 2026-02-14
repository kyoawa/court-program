import { NextRequest } from "next/server";
import { updateOnlineDescription } from "@/lib/dutchie-client";
import { cacheDelete } from "@/lib/cache";

export async function POST(req: NextRequest) {
  try {
    const { productId, description } = (await req.json()) as {
      productId: number;
      description: string;
    };

    if (!productId || !description) {
      return new Response(
        JSON.stringify({ error: "productId and description are required" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    const result = await updateOnlineDescription(productId, description);
    cacheDelete("products:all");

    return new Response(JSON.stringify({ success: true, product: result }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to save description";
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
