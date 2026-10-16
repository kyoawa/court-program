import { NextRequest, NextResponse } from "next/server";
import { ensureSchema, sql } from "@/lib/db";
import { fetchImage } from "@/lib/page-fetch";
import { canonicalImageUrl, keywordsFromTitle } from "@/lib/brand-crawler";
import { MAX_IMAGE_SIZE_MB, SUPPORTED_IMAGE_TYPES } from "@/lib/constants";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

interface ImportItem {
  imageUrl: string;
  title: string;
  pageUrl?: string;
  /** Overrides the keywords derived from the title. */
  keywords?: string[];
}

/**
 * Downloads selected scan candidates into the image repository under the
 * brand's group, optionally creating a brand + keywords matching rule each.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const id = Number((await params).id);
    if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ error: "Invalid id" }, { status: 400 });
    const { items, createRules } = (await req.json()) as { items: ImportItem[]; createRules?: boolean };
    if (!Array.isArray(items) || !items.length || items.length > 500) {
      return NextResponse.json({ error: "Select between 1 and 500 images to import." }, { status: 400 });
    }
    await ensureSchema();
    const query = sql();
    const rows = await query`SELECT * FROM brand_sources WHERE id = ${id}`;
    if (!rows.length) return NextResponse.json({ error: "Source not found" }, { status: 404 });
    const brand = rows[0].brand_name as string;

    const results: { imageUrl: string; id?: number; ruleId?: number; error?: string }[] = [];
    for (const item of items) {
      try {
        if (typeof item.imageUrl !== "string") throw new Error("Missing image URL");
        const sourceUrl = canonicalImageUrl(item.imageUrl);
        const existing = await query`SELECT id FROM repository_images WHERE source_url = ${sourceUrl}`;
        if (existing.length) { results.push({ imageUrl: item.imageUrl, id: existing[0].id as number, error: "Already in repository" }); continue; }

        const { buffer, mimeType } = await fetchImage(item.imageUrl, MAX_IMAGE_SIZE_MB * 1024 * 1024);
        if (!SUPPORTED_IMAGE_TYPES.includes(mimeType)) throw new Error(`Unsupported image type ${mimeType}`);
        const title = (item.title || "").trim() || new URL(item.imageUrl).pathname.split("/").pop() || "Imported image";
        const ext = mimeType === "image/png" ? ".png" : mimeType === "image/webp" ? ".webp" : ".jpg";
        const fileName = `${title.replace(/[^a-zA-Z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 60) || "image"}${ext}`;
        const inserted = await query`
          INSERT INTO repository_images (name, file_name, mime_type, image_data, group_name, source_url)
          VALUES (${title}, ${fileName}, ${mimeType}, ${buffer}, ${brand}, ${sourceUrl})
          RETURNING id
        `;
        const imageId = inserted[0].id as number;
        let ruleId: number | undefined;
        if (createRules) {
          const keywords = (Array.isArray(item.keywords) ? item.keywords : keywordsFromTitle(title, brand))
            .map((keyword) => String(keyword).trim().toLowerCase()).filter(Boolean).slice(0, 10);
          const rule = await query`
            INSERT INTO matching_rules (image_id, brand_name, product_name_keywords, priority)
            VALUES (${imageId}, ${brand}, ${keywords.length ? keywords : null}, ${keywords.length ? 2 : 1})
            RETURNING id
          `;
          ruleId = rule[0].id as number;
        }
        results.push({ imageUrl: item.imageUrl, id: imageId, ruleId });
      } catch (error) {
        results.push({ imageUrl: item.imageUrl, error: error instanceof Error ? error.message : "Import failed" });
      }
    }
    return NextResponse.json({
      imported: results.filter((r) => r.id && !r.error).length,
      skipped: results.filter((r) => r.error === "Already in repository").length,
      failed: results.filter((r) => r.error && r.error !== "Already in repository").length,
      results,
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Import failed" }, { status: 500 });
  }
}
