import { NextRequest } from "next/server";
import { sql } from "@/lib/db";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const query = sql();

    const rows = await query`
      SELECT image_data, mime_type FROM repository_images WHERE id = ${Number(id)}
    `;

    if (rows.length === 0) {
      return new Response("Not found", { status: 404 });
    }

    const row = rows[0];
    // Neon HTTP driver returns bytea as a hex string like \x89504e...
    let bytes: Uint8Array;
    const data = row.image_data;
    if (data instanceof Uint8Array) {
      bytes = data;
    } else if (typeof data === "string") {
      if (data.startsWith("\\x")) {
        const hex = data.slice(2);
        const arr = new Uint8Array(hex.length / 2);
        for (let i = 0; i < hex.length; i += 2) {
          arr[i / 2] = parseInt(hex.substring(i, i + 2), 16);
        }
        bytes = arr;
      } else {
        // base64
        bytes = Uint8Array.from(atob(data), (c) => c.charCodeAt(0));
      }
    } else if (data instanceof ArrayBuffer) {
      bytes = new Uint8Array(data);
    } else {
      bytes = new Uint8Array(Buffer.from(data));
    }

    return new Response(bytes as unknown as BodyInit, {
      headers: {
        "Content-Type": row.mime_type as string,
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to get image";
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const query = sql();

    await query`
      DELETE FROM repository_images WHERE id = ${Number(id)}
    `;

    return Response.json({ success: true });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to delete image";
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
