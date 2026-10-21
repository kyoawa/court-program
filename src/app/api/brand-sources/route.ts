import { NextRequest, NextResponse } from "next/server";
import { ensureSchema, sql } from "@/lib/db";
import { isPublicHttpUrl } from "@/lib/page-fetch";

export const dynamic = "force-dynamic";

export interface BrandSourceRow {
  id: number;
  brandName: string;
  url: string;
  label: string | null;
  pathPrefix: string | null;
  /** Optional Cookie header copied from the user's browser for gated or logged-in sites. */
  cookies: string | null;
  lastScannedAt: string | null;
  lastScanSummary: { pagesVisited: number; candidates: number; truncated: boolean; errors: number } | null;
  createdAt: string;
}

export function toRow(row: Record<string, unknown>): BrandSourceRow {
  return {
    id: row.id as number,
    brandName: row.brand_name as string,
    url: row.url as string,
    label: (row.label as string | null) ?? null,
    pathPrefix: (row.path_prefix as string | null) ?? null,
    cookies: (row.cookies as string | null) ?? null,
    lastScannedAt: (row.last_scanned_at as string | null) ?? null,
    lastScanSummary: (row.last_scan_summary as BrandSourceRow["lastScanSummary"]) ?? null,
    createdAt: row.created_at as string,
  };
}

export async function GET() {
  try {
    await ensureSchema();
    const query = sql();
    const rows = await query`SELECT * FROM brand_sources ORDER BY brand_name, created_at`;
    return NextResponse.json(rows.map(toRow), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to list sources" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as { brandName?: string; url?: string; label?: string | null; pathPrefix?: string | null; cookies?: string | null };
    const brandName = body.brandName?.trim();
    const url = body.url?.trim();
    if (!brandName || !url) return NextResponse.json({ error: "brandName and url are required" }, { status: 400 });
    if (!isPublicHttpUrl(url)) return NextResponse.json({ error: "Enter a public http(s) page URL." }, { status: 400 });
    const pathPrefix = body.pathPrefix?.trim() ? `/${body.pathPrefix.trim().replace(/^\/+|\/+$/g, "")}` : null;
    await ensureSchema();
    const query = sql();
    const cookies = body.cookies?.trim() || null;
    const rows = await query`
      INSERT INTO brand_sources (brand_name, url, label, path_prefix, cookies)
      VALUES (${brandName}, ${url}, ${body.label?.trim() || null}, ${pathPrefix}, ${cookies})
      ON CONFLICT (brand_name, url) DO UPDATE SET label = EXCLUDED.label, path_prefix = EXCLUDED.path_prefix, cookies = EXCLUDED.cookies
      RETURNING *
    `;
    return NextResponse.json(toRow(rows[0]));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to save source" }, { status: 500 });
  }
}
