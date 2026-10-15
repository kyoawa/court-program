import { NextResponse } from "next/server";
import { getInventoryMap } from "@/lib/inventory";

export async function GET() {
  try {
    const inventoryMap = await getInventoryMap();
    return NextResponse.json(inventoryMap, {
      headers: { "Cache-Control": "private, max-age=300" },
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to fetch inventory";
    console.error("[inventory] Error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
