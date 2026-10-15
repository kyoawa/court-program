import { NextRequest, NextResponse } from "next/server";
import { ensureSchema, sql } from "@/lib/db";
import { getProducts } from "@/lib/dutchie-client";

export async function POST(req: NextRequest) {
  try {
    const { items } = await req.json() as { items: { operationId: string; productId: number }[] };
    if (!Array.isArray(items) || !items.length || items.length > 10000 ||
      items.some(item => !item || !Number.isSafeInteger(item.productId) || item.productId <= 0 ||
        item.productId > 2147483647 || typeof item.operationId !== "string" ||
        !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(item.operationId)) ||
      new Set(items.map(item => item.productId)).size !== items.length ||
      new Set(items.map(item => item.operationId)).size !== items.length) {
      return NextResponse.json({ error: "Queue one replacement image per product (up to 10,000 products)." }, { status: 400 });
    }
    await ensureSchema();
    // One fresh catalog read per run, not one full catalog read per product.
    const products = new Map((await getProducts()).map(product => [product.productId, product]));
    const plans = items.map(item => {
      const product = products.get(item.productId);
      if (!product) throw new Error(`Product ${item.productId} is unavailable. Remove it from the queue and retry.`);
      const urls = product.imageUrls?.length ? product.imageUrls : product.imageUrl ? [product.imageUrl] : [];
      return { operation_id: item.operationId, product_id: item.productId, old_urls: [...new Set(urls)] };
    });
    const query = sql();
    await query`
      INSERT INTO image_replacements (operation_id, product_id, old_urls)
      SELECT operation_id, product_id, old_urls FROM jsonb_to_recordset(${JSON.stringify(plans)}::jsonb)
      AS plan(operation_id uuid, product_id integer, old_urls jsonb)
      ON CONFLICT (operation_id) DO NOTHING
    `;
    return NextResponse.json({ planned: plans.length });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to prepare replacements" }, { status: 500 });
  }
}
