import { NextRequest, NextResponse } from "next/server";
import { ensureSchema, sql } from "@/lib/db";
import { isPublicHttpUrl } from "@/lib/page-fetch";
import { toRow } from "../route";

export const dynamic = "force-dynamic";

function parseId(value: string): number | null {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const id = parseId((await params).id);
    if (!id) return NextResponse.json({ error: "Invalid id" }, { status: 400 });
    const body = (await req.json()) as { brandName?: string; url?: string; label?: string | null; pathPrefix?: string | null };
    if (body.url !== undefined && !isPublicHttpUrl(body.url)) return NextResponse.json({ error: "Enter a public http(s) page URL." }, { status: 400 });
    await ensureSchema();
    const query = sql();
    const current = await query`SELECT * FROM brand_sources WHERE id = ${id}`;
    if (!current.length) return NextResponse.json({ error: "Source not found" }, { status: 404 });
    const pathPrefix = body.pathPrefix === undefined
      ? current[0].path_prefix
      : body.pathPrefix?.trim() ? `/${body.pathPrefix.trim().replace(/^\/+|\/+$/g, "")}` : null;
    const rows = await query`
      UPDATE brand_sources SET
        brand_name = ${body.brandName?.trim() || current[0].brand_name},
        url = ${body.url?.trim() || current[0].url},
        label = ${body.label === undefined ? current[0].label : body.label?.trim() || null},
        path_prefix = ${pathPrefix}
      WHERE id = ${id}
      RETURNING *
    `;
    return NextResponse.json(toRow(rows[0]));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to update source" }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const id = parseId((await params).id);
    if (!id) return NextResponse.json({ error: "Invalid id" }, { status: 400 });
    await ensureSchema();
    const query = sql();
    await query`DELETE FROM brand_sources WHERE id = ${id}`;
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to delete source" }, { status: 500 });
  }
}
