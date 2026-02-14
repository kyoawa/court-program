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
    // Neon returns bytea as a hex string like \x89504e...
    let imageData: Buffer;
    if (row.image_data instanceof Buffer) {
      imageData = row.image_data;
    } else if (typeof row.image_data === "string") {
      const hex = row.image_data as string;
      if (hex.startsWith("\\x")) {
        imageData = Buffer.from(hex.slice(2), "hex");
      } else {
        imageData = Buffer.from(hex, "base64");
      }
    } else {
      imageData = Buffer.from(row.image_data as ArrayBuffer);
    }

    return new Response(new Uint8Array(imageData), {
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
