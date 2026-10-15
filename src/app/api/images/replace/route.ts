import { createHash } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { sql, ensureSchema, withProductImageLock, findUploadedImageIdsByProduct, recordUploadedImage, deleteUploadedImageRecord } from "@/lib/db";
import { setImage, removeImage } from "@/lib/dutchie-client";
import { replaceImage, type ReplacementState } from "@/lib/replace-image";
import { cacheDelete } from "@/lib/cache";
import { MAX_IMAGE_SIZE_MB } from "@/lib/constants";

export async function POST(req: NextRequest) {
  try {
    const { operationId, productId, base64Image, fileName, imageUrl } = await req.json();
    if (!Number.isSafeInteger(productId) || productId <= 0 || productId > 2147483647 ||
      typeof operationId !== "string" || !/^[0-9a-f-]{36}$/i.test(operationId) ||
      (!base64Image && !imageUrl) || (base64Image && typeof base64Image !== "string") ||
      (imageUrl && (typeof imageUrl !== "string" || !/^https?:\/\//i.test(imageUrl)))) {
      return NextResponse.json({ error: "A valid product, operation, and image are required." }, { status: 400 });
    }
    if (base64Image && base64Image.length > Math.ceil(MAX_IMAGE_SIZE_MB * 1024 * 1024 / 3) * 4) {
      return NextResponse.json({ error: "Image exceeds the upload size limit." }, { status: 400 });
    }
    await ensureSchema();
    const result = await withProductImageLock(productId, async () => {
      const query = sql();
      const rows = await query`SELECT * FROM image_replacements WHERE operation_id = ${operationId}::uuid AND product_id = ${productId}`;
      if (!rows.length) throw new Error("Prepare the replacement queue before uploading.");
      const fingerprint = createHash("sha256").update(base64Image ? `file:${base64Image}` : `url:${imageUrl}`).digest("hex");
      // Download before entering the uncertain-upload state: download failures
      // are safe to retry because no Dutchie mutation has occurred.
      let prepared = base64Image;
      let name = typeof fileName === "string" ? fileName : "image.jpg";
      const state = rows[0].state as ReplacementState;
      if (state.phase === "planned" && !prepared) {
        const response = await fetch(imageUrl, { signal: AbortSignal.timeout(30000) });
        if (!response.ok) throw new Error(`Image download failed (${response.status}). No images were changed.`);
        if (!response.headers.get("content-type")?.startsWith("image/")) throw new Error("The URL must return an image.");
        const reader = response.body?.getReader();
        if (!reader) throw new Error("Image download returned no data.");
        const chunks: Uint8Array[] = [];
        let size = 0;
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          size += value.byteLength;
          if (size > MAX_IMAGE_SIZE_MB * 1024 * 1024) {
            await reader.cancel();
            throw new Error("Image exceeds the upload size limit.");
          }
          chunks.push(value);
        }
        if (!size) throw new Error("Image download returned no data.");
        prepared = Buffer.concat(chunks).toString("base64");
        name = new URL(imageUrl).pathname.split("/").pop() || "image.jpg";
      }
      return replaceImage(state, rows[0].old_urls, fingerprint, {
        save: async value => { await query`UPDATE image_replacements SET state = ${JSON.stringify(value)}::jsonb, updated_at = NOW() WHERE operation_id = ${operationId}::uuid`; },
        mappings: () => findUploadedImageIdsByProduct({ productId }),
        upload: () => setImage({ productId, base64Image: prepared, fileName: name }),
        record: image => recordUploadedImage({ productId, ...image }),
        remove: imageId => removeImage({ productId, imageId }),
        forget: imageId => deleteUploadedImageRecord({ productId, imageId }),
      });
    });
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Replacement failed" }, { status: (error as { status?: number })?.status === 429 ? 429 : 500 });
  } finally {
    cacheDelete("products:all");
  }
}
