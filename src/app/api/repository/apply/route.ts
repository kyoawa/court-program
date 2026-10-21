import { NextRequest } from "next/server";
import { ensureSchema, loadExclusions } from "@/lib/db";
import { createApplyStream, SSE_HEADERS, type ApplyItem } from "@/lib/repository-apply";

export const maxDuration = 300;

export async function POST(req: NextRequest) {
  try {
    await ensureSchema();
    const { items, overwriteExisting, location } = (await req.json()) as {
      items: ApplyItem[];
      overwriteExisting?: boolean;
      location?: string;
    };

    if (!items || !Array.isArray(items) || items.length === 0) {
      return new Response(JSON.stringify({ error: "items array is required" }), { status: 400, headers: { "Content-Type": "application/json" } });
    }

    const exclusions = await loadExclusions(Array.from(new Set(items.map((i) => i.imageId))));
    const filteredItems = items.filter((it) => !exclusions.get(it.imageId)?.has(it.productId));
    if (filteredItems.length === 0) {
      return new Response(JSON.stringify({ error: "All items were excluded — nothing to apply" }), { status: 400, headers: { "Content-Type": "application/json" } });
    }

    return new Response(createApplyStream(filteredItems, { overwriteExisting: overwriteExisting === true, location }), { headers: SSE_HEADERS });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to apply images";
    return new Response(JSON.stringify({ error: message }), { status: 500, headers: { "Content-Type": "application/json" } });
  }
}
