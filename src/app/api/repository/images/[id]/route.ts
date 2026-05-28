import { NextRequest } from "next/server";
import { sql } from "@/lib/db";
import { SUPPORTED_IMAGE_TYPES, MAX_IMAGE_SIZE_MB } from "@/lib/constants";

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

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const imageId = Number(id);
    if (!Number.isFinite(imageId)) {
      return new Response(
        JSON.stringify({ error: "Invalid image id" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    const { name, base64Image, fileName, mimeType, groupName } = (await req.json()) as {
      name: string;
      base64Image: string;
      fileName: string;
      mimeType: string;
      groupName?: string | null;
    };

    if (!name || !base64Image || !fileName || !mimeType) {
      return new Response(
        JSON.stringify({
          error: "name, base64Image, fileName, and mimeType are required",
        }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    if (!SUPPORTED_IMAGE_TYPES.includes(mimeType)) {
      return new Response(
        JSON.stringify({
          error: `Unsupported image type: ${mimeType}. Allowed: ${SUPPORTED_IMAGE_TYPES.join(", ")}`,
        }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    const imageBuffer = Buffer.from(base64Image, "base64");
    const maxBytes = MAX_IMAGE_SIZE_MB * 1024 * 1024;
    if (imageBuffer.length > maxBytes) {
      return new Response(
        JSON.stringify({
          error: `Image too large (${(imageBuffer.length / 1024 / 1024).toFixed(1)}MB). Maximum: ${MAX_IMAGE_SIZE_MB}MB`,
        }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    const query = sql();
    const group = groupName?.trim() || null;

    const result = await query`
      UPDATE repository_images
      SET name = ${name},
          file_name = ${fileName},
          mime_type = ${mimeType},
          image_data = ${imageBuffer},
          group_name = ${group},
          updated_at = NOW()
      WHERE id = ${imageId}
      RETURNING id, name, file_name, mime_type, group_name, updated_at
    `;

    if (result.length === 0) {
      return new Response(
        JSON.stringify({ error: "Image not found" }),
        { status: 404, headers: { "Content-Type": "application/json" } }
      );
    }

    const row = result[0];
    return Response.json({
      id: row.id,
      name: row.name,
      fileName: row.file_name,
      mimeType: row.mime_type,
      groupName: row.group_name ?? null,
      updatedAt: row.updated_at,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to update image";
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
