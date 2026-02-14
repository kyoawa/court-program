import { NextRequest } from "next/server";
import { sql } from "@/lib/db";
import { setImage } from "@/lib/dutchie-client";
import { cacheDelete } from "@/lib/cache";

interface ApplyItem {
  productId: number;
  imageId: number;
  productName?: string;
}

function encode(data: Record<string, unknown>): string {
  return `data: ${JSON.stringify(data)}\n\n`;
}

export async function POST(req: NextRequest) {
  try {
    const { items } = (await req.json()) as { items: ApplyItem[] };

    if (!items || !Array.isArray(items) || items.length === 0) {
      return new Response(
        JSON.stringify({ error: "items array is required" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    const stream = new ReadableStream({
      async start(controller) {
        const enc = new TextEncoder();
        const query = sql();

        for (const item of items) {
          controller.enqueue(
            enc.encode(
              encode({
                type: "start",
                productId: item.productId,
                productName: item.productName,
              })
            )
          );

          try {
            const rows = await query`
              SELECT image_data, file_name FROM repository_images WHERE id = ${item.imageId}
            `;

            if (rows.length === 0) {
              throw new Error(`Repository image ${item.imageId} not found`);
            }

            const row = rows[0];
            let imageData: Buffer;
            if (row.image_data instanceof Buffer) {
              imageData = row.image_data;
            } else if (typeof row.image_data === "string") {
              const hex = row.image_data as string;
              if (hex.startsWith("\\x")) {
                imageData = Buffer.from(hex.slice(2), "hex");
              } else {
                imageData = Buffer.from(hex, "base64");
              }
            } else {
              imageData = Buffer.from(row.image_data as ArrayBuffer);
            }
            const base64 = imageData.toString("base64");

            const result = await setImage({
              productId: item.productId,
              base64Image: base64,
              fileName: row.file_name as string,
            });

            controller.enqueue(
              enc.encode(
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
              enc.encode(
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
        controller.enqueue(enc.encode(encode({ type: "done" })));
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
      error instanceof Error ? error.message : "Failed to apply images";
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
