import {
  sql,
  recordUploadedImage,
  findUploadedImageIdsByProduct,
  deleteUploadedImageRecord,
} from "./db";
import { getProducts, removeImage, setImage } from "./dutchie-client";
import { cacheDelete } from "./cache";

/**
 * Pushes repository images to Dutchie products as a server-sent event stream.
 * Shared by the bulk apply route and the per-image apply route.
 */
export interface ApplyItem {
  productId: number;
  imageId: number;
  productName?: string | null;
}

export interface ApplyOptions {
  overwriteExisting?: boolean;
  location?: string;
}

function encode(data: Record<string, unknown>): string {
  return `data: ${JSON.stringify(data)}\n\n`;
}

function toBuffer(data: unknown): Buffer {
  if (data instanceof Buffer) return data;
  if (typeof data === "string") return data.startsWith("\\x") ? Buffer.from(data.slice(2), "hex") : Buffer.from(data, "base64");
  return Buffer.from(data as ArrayBuffer);
}

export function createApplyStream(items: ApplyItem[], options: ApplyOptions = {}): ReadableStream {
  const shouldOverwrite = options.overwriteExisting === true;
  const location = options.location;
  return new ReadableStream({
    async start(controller) {
      const enc = new TextEncoder();
      const send = (data: Record<string, unknown>) => controller.enqueue(enc.encode(encode(data)));
      const query = sql();

      // For overwrite mode we need the live image URLs to know what counts as "unmanaged".
      let productById: Map<number, { imageUrls: string[] | null; imageUrl: string | null }> | null = null;
      if (shouldOverwrite) {
        try {
          const all = await getProducts({ isActive: true });
          productById = new Map(all.map((p) => [p.productId, { imageUrls: p.imageUrls, imageUrl: p.imageUrl }]));
        } catch (err) {
          console.error("[apply] Failed to fetch products for overwrite mode:", err);
          productById = new Map();
        }
      }

      // Read each repository image once, not once per product.
      const imageCache = new Map<number, { data: Buffer; fileName: string } | null>();
      const loadImage = async (imageId: number) => {
        if (!imageCache.has(imageId)) {
          const rows = await query`SELECT image_data, file_name FROM repository_images WHERE id = ${imageId}`;
          imageCache.set(imageId, rows.length ? { data: toBuffer(rows[0].image_data), fileName: rows[0].file_name as string } : null);
        }
        return imageCache.get(imageId) ?? null;
      };

      for (const item of items) {
        send({ type: "start", productId: item.productId, productName: item.productName });
        let removedCount = 0;
        let unmanagedCount = 0;

        if (shouldOverwrite && productById) {
          const existing = productById.get(item.productId);
          const liveUrls = existing?.imageUrls ?? (existing?.imageUrl ? [existing.imageUrl] : []);
          const tracked = await findUploadedImageIdsByProduct({ productId: item.productId, location });
          const byUrl = new Map(tracked.map((t) => [t.imageUrl, t.imageId]));
          for (const url of liveUrls) {
            const trackedId = byUrl.get(url);
            if (!trackedId) { unmanagedCount++; continue; }
            try {
              await removeImage({ productId: item.productId, imageId: trackedId });
              await deleteUploadedImageRecord({ productId: item.productId, imageId: trackedId, location });
              removedCount++;
            } catch (err) {
              console.error(`[apply] removeImage failed for product ${item.productId}, image ${trackedId}:`, err);
            }
          }
        }

        try {
          const image = await loadImage(item.imageId);
          if (!image) throw new Error(`Repository image ${item.imageId} not found`);
          const result = await setImage({ productId: item.productId, base64Image: image.data.toString("base64"), fileName: image.fileName });
          if (result.imageId && result.imageUrl) {
            try {
              await recordUploadedImage({ productId: item.productId, imageId: result.imageId, imageUrl: result.imageUrl, location, repositoryImageId: item.imageId });
            } catch (err) {
              console.error("[apply] Failed to record uploaded image:", err);
            }
          }
          send({ type: "success", productId: item.productId, productName: item.productName, removedCount, unmanagedCount, addedCount: 1, result });
        } catch (error) {
          send({ type: "error", productId: item.productId, productName: item.productName, removedCount, unmanagedCount, addedCount: 0, error: error instanceof Error ? error.message : "Unknown error" });
        }
      }

      cacheDelete("products:all");
      send({ type: "done" });
      controller.close();
    },
  });
}

export const SSE_HEADERS = { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" };
