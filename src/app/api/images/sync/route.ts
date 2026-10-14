import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { ensureSchema, sql } from "@/lib/db";
import { getProducts } from "@/lib/dutchie-client";
import { validateSnapshot } from "@/lib/image-sync";

export const dynamic = "force-dynamic";

function authorized(req: NextRequest) {
  const secret = process.env.SYNC_IMPORT_TOKEN;
  const supplied = req.headers.get("authorization")?.replace(/^Bearer /, "");
  return !!secret && !!supplied && Buffer.byteLength(secret) === Buffer.byteLength(supplied) &&
    timingSafeEqual(Buffer.from(secret), Buffer.from(supplied));
}

export async function GET(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({ error: "Invalid sync key." }, { status: 401 });
  try {
    // Catalog-wide: do not filter to one store's inventory or active products.
    const products = await getProducts();
    return NextResponse.json({ productIds: [...new Set(products.map(p => p.productId))] },
      { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "Unable to load catalog products from Dutchie." }, { status: 502 });
  }
}

export async function POST(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({ error: "Invalid sync key." }, { status: 401 });
  const raw = await req.text();
  if (Buffer.byteLength(raw) > 256_000) return NextResponse.json({ error: "Snapshot too large." }, { status: 413 });
  let snapshot;
  try { snapshot = validateSnapshot(JSON.parse(raw)); }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Invalid snapshot." }, { status: 400 }); }
  try {
    await ensureSchema();
    const query = sql();
    const rows = await query`
      INSERT INTO catalog_image_snapshots (product_id, captured_at, images)
      VALUES (${snapshot.productId}, ${snapshot.capturedAt}, ${JSON.stringify(snapshot.images)}::jsonb)
      ON CONFLICT (product_id) DO UPDATE SET captured_at = EXCLUDED.captured_at, images = EXCLUDED.images
      WHERE catalog_image_snapshots.captured_at <= EXCLUDED.captured_at
      RETURNING product_id
    `;
    return NextResponse.json({ synced: rows.length === 1, productId: snapshot.productId, imageCount: snapshot.images.length });
  } catch {
    return NextResponse.json({ error: "Unable to save image mappings. Retry sync." }, { status: 500 });
  }
}
