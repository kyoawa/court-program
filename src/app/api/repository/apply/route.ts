import { NextRequest } from "next/server";
import {
  sql,
  ensureSchema,
  recordUploadedImage,
  findUploadedImageIdsByProduct,
  deleteUploadedImageRecord,
} from "@/lib/db";
import { getProducts, removeImage, setImage } from "@/lib/dutchie-client";
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
    await ensureSchema();
    const { items, overwriteExisting, location } = (await req.json()) as {
      items: ApplyItem[];
      overwriteExisting?: boolean;
      location?: string;
    };

    if (!items || !Array.isArray(items) || items.length === 0) {
      return new Response(
        JSON.stringify({ error: "items array is required" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    const shouldOverwrite = overwriteExisting === true;

    const filterQuery = sql();
    const imageIds = Array.from(new Set(items.map((i) => i.imageId)));
    const exclusionRows = (await filterQuery`
      SELECT id, COALESCE(excluded_product_ids, '{}'::INTEGER[]) as excluded_product_ids
      FROM repository_images
      WHERE id = ANY(${imageIds}::INTEGER[])
    `) as { id: number; excluded_product_ids: number[] }[];
    const exclusionsByImage = new Map<number, Set<number>>();
    for (const row of exclusionRows) {
      exclusionsByImage.set(row.id, new Set(row.excluded_product_ids ?? []));
    }
    const filteredItems = items.filter((it) => {
      const excl = exclusionsByImage.get(it.imageId);
      return !excl || !excl.has(it.productId);
    });

    if (filteredItems.length === 0) {
      return new Response(
        JSON.stringify({ error: "All items were excluded — nothing to apply" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    const stream = new ReadableStream({
      async start(controller) {
        const enc = new TextEncoder();
        const query = sql();

        // For overwrite mode we need the live image URLs to know what counts as "unmanaged".
        let productById: Map<
          number,
          { imageUrls: string[] | null; imageUrl: string | null }
        > | null = null;
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
            console.error(
              "[apply] Failed to fetch products for overwrite mode:",
              err
            );
            productById = new Map();
          }
        }

        for (const item of filteredItems) {
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
          let unmanagedCount = 0;

          if (shouldOverwrite && productById) {
            const existing = productById.get(item.productId);
            const liveUrls =
              existing?.imageUrls ??
              (existing?.imageUrl ? [existing.imageUrl] : []);

            const tracked = await findUploadedImageIdsByProduct({
              productId: item.productId,
              location,
            });
            const byUrl = new Map(tracked.map((t) => [t.imageUrl, t.imageId]));

            for (const url of liveUrls) {
              const trackedId = byUrl.get(url);
              if (!trackedId) {
                unmanagedCount++;
                continue;
              }
              try {
                await removeImage({
                  productId: item.productId,
                  imageId: trackedId,
                });
                await deleteUploadedImageRecord({
                  productId: item.productId,
                  imageId: trackedId,
                  location,
                });
                removedCount++;
              } catch (err) {
                console.error(
                  `[apply] removeImage failed for product ${item.productId}, image ${trackedId}:`,
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

            if (result.imageId && result.imageUrl) {
              try {
                await recordUploadedImage({
                  productId: item.productId,
                  imageId: result.imageId,
                  imageUrl: result.imageUrl,
                  location,
                });
              } catch (err) {
                console.error(
                  "[apply] Failed to record uploaded image:",
                  err
                );
              }
            }

            controller.enqueue(
              enc.encode(
                encode({
                  type: "success",
                  productId: item.productId,
                  productName: item.productName,
                  removedCount,
                  unmanagedCount,
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
                  unmanagedCount,
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
