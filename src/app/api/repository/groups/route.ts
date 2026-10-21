import { NextRequest } from "next/server";
import { sql, ensureSchema } from "@/lib/db";

/** Renames a group (or merges it into an existing one) across every image in it. */
export async function PATCH(req: NextRequest) {
  try {
    await ensureSchema();
    const { from, to } = (await req.json()) as { from?: string; to?: string | null };
    if (!from?.trim()) {
      return new Response(JSON.stringify({ error: "from is required" }), { status: 400, headers: { "Content-Type": "application/json" } });
    }
    const target = to?.trim() || null;
    const query = sql();
    const rows = await query`UPDATE repository_images SET group_name = ${target}, updated_at = NOW() WHERE group_name = ${from.trim()} RETURNING id`;
    return Response.json({ affected: rows.length, groupName: target });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to rename group";
    return new Response(JSON.stringify({ error: message }), { status: 500, headers: { "Content-Type": "application/json" } });
  }
}
