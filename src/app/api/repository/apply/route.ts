import { NextRequest } from "next/server";
import { sql } from "@/lib/db";
import { getProducts, removeImage, setImage } from "@/lib/dutchie-client";
import { cacheDelete } from "@/lib/cache";
import { extractImageIdFromUrl } from "@/lib/utils";

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
    const { items, overwriteExisting } = (await req.json()) as {
      items: ApplyItem[];
      overwriteExisting?: boolean;
    };

    if (!items || !Array.isArray(items) || items.length === 0) {
      return new Response(
        JSON.stringify({ error: "items array is required" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    const shouldOverwrite = overwriteExisting === true;

    const stream = new ReadableStream({
      async start(controller) {
        const enc = new TextEncoder();
        const query = sql();

        // Snapshot of existing products is only needed for overwrite mode.
        let productById: Map<number, { imageUrls: string[] | null; imageUrl: string | null }> | null = null;
        if (shouldOverwrite) {
          try {
            const all = await getProducts({ isActive: true });
            productById = new Map(
              all.map((p) => [
                p.productId,
                { imageUrls: p.imageUrls, imageUrl: p.imageUrl },
              ])
            );
          } catch (err) {
            console.error("[apply] Failed to fetch products for overwrite mode:", err);
            productById = new Map();
          }
        }

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

          let removedCount = 0;

          if (shouldOverwrite && productById) {
            const existing = productById.get(item.productId);
            const urls = existing?.imageUrls ?? (existing?.imageUrl ? [existing.imageUrl] : []);
            for (const url of urls) {
              const extractedId = extractImageIdFromUrl(url);
              if (!extractedId) {
                console.warn(`[apply] Could not extract imageId from URL: ${url}`);
                continue;
              }
              try {
                await removeImage({
                  productId: item.productId,
                  // Dutchie's removeImage typing is number, but URL-extracted IDs are
                  // commonly UUIDs/hashes. Pass through what we parsed.
                  imageId: extractedId as unknown as number,
                });
                removedCount++;
              } catch (err) {
                console.error(
                  `[apply] removeImage failed for product ${item.productId}, image ${extractedId}:`,
                  err
                );
              }
            }
          }

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
                  removedCount,
                  addedCount: 1,
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
                  removedCount,
                  addedCount: 0,
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
