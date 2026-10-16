import { NextRequest } from "next/server";
import { ensureSchema, sql } from "@/lib/db";
import { fetchHtml } from "@/lib/page-fetch";
import { canonicalImageUrl, crawlBrandSource, keywordsFromTitle, type CrawlCandidate } from "@/lib/brand-crawler";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export interface ScanCandidate extends CrawlCandidate {
  /** Already in the repository (matched by source URL). */
  imported: boolean;
  /** Keywords an auto-created matching rule would use. */
  keywords: string[];
}

function encode(data: Record<string, unknown>): string {
  return `data: ${JSON.stringify(data)}\n\n`;
}

/** Streams crawl progress, then the candidate list with already-imported images flagged. */
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  if (!Number.isInteger(id) || id <= 0) {
    return new Response(JSON.stringify({ error: "Invalid id" }), { status: 400, headers: { "Content-Type": "application/json" } });
  }
  await ensureSchema();
  const query = sql();
  const rows = await query`SELECT * FROM brand_sources WHERE id = ${id}`;
  if (!rows.length) {
    return new Response(JSON.stringify({ error: "Source not found" }), { status: 404, headers: { "Content-Type": "application/json" } });
  }
  const source = rows[0];

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      const send = (data: Record<string, unknown>) => controller.enqueue(encoder.encode(encode(data)));
      try {
        const result = await crawlBrandSource(
          { url: source.url as string, pathPrefix: source.path_prefix as string | null },
          { fetchPage: fetchHtml },
          {},
          (progress) => send({ type: "progress", ...progress }),
        );
        const canonical = result.candidates.map((candidate) => canonicalImageUrl(candidate.imageUrl));
        const existing = canonical.length
          ? await query`SELECT source_url FROM repository_images WHERE source_url = ANY(${canonical}::text[])`
          : [];
        const importedUrls = new Set(existing.map((row) => row.source_url as string));
        const candidates: ScanCandidate[] = result.candidates.map((candidate, index) => ({
          ...candidate,
          imported: importedUrls.has(canonical[index]),
          keywords: keywordsFromTitle(candidate.title, source.brand_name as string),
        }));
        const summary = { pagesVisited: result.pagesVisited, candidates: candidates.length, truncated: result.truncated, errors: result.errors.length };
        await query`UPDATE brand_sources SET last_scanned_at = NOW(), last_scan_summary = ${JSON.stringify(summary)}::jsonb WHERE id = ${id}`;
        send({ type: "done", candidates, pagesVisited: result.pagesVisited, truncated: result.truncated, truncatedReason: result.truncatedReason, errors: result.errors });
      } catch (error) {
        send({ type: "error", error: error instanceof Error ? error.message : "Scan failed" });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" },
  });
}
