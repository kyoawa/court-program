import { NextRequest } from "next/server";
import { setImage } from "@/lib/dutchie-client";
import { cacheDelete } from "@/lib/cache";

interface BatchItem {
  productId: number;
  imageUrl: string;
  productName?: string;
}

function encode(data: Record<string, unknown>): string {
  return `data: ${JSON.stringify(data)}\n\n`;
}

export async function POST(req: NextRequest) {
  try {
    const { items } = (await req.json()) as { items: BatchItem[] };

    if (!items || !Array.isArray(items) || items.length === 0) {
      return new Response(
        JSON.stringify({ error: "items array is required" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    const stream = new ReadableStream({
      async start(controller) {
        const encoder = new TextEncoder();

        for (const item of items) {
          controller.enqueue(
            encoder.encode(
              encode({
                type: "start",
                productId: item.productId,
                productName: item.productName,
              })
            )
          );

          try {
            const imageRes = await fetch(item.imageUrl);
            if (!imageRes.ok) {
              throw new Error(
                `Failed to fetch image: ${imageRes.status} ${imageRes.statusText}`
              );
            }
            const buffer = await imageRes.arrayBuffer();
            const base64 = Buffer.from(buffer).toString("base64");

            let fileName = "image.jpg";
            try {
              const pathname = new URL(item.imageUrl).pathname;
              const parts = pathname.split("/");
              fileName = parts[parts.length - 1] || "image.jpg";
            } catch {
              // keep default
            }

            const result = await setImage({
              productId: item.productId,
              base64Image: base64,
              fileName,
            });

            controller.enqueue(
              encoder.encode(
                encode({
                  type: "success",
                  productId: item.productId,
                  productName: item.productName,
                  result,
                })
              )
            );
          } catch (error) {
            controller.enqueue(
              encoder.encode(
                encode({
                  type: "error",
                  productId: item.productId,
                  productName: item.productName,
                  error:
                    error instanceof Error ? error.message : "Unknown error",
                })
              )
            );
          }
        }

        cacheDelete("products:all");
        controller.enqueue(encoder.encode(encode({ type: "done" })));
        controller.close();
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to process batch";
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
