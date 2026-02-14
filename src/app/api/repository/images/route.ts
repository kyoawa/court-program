import { NextRequest } from "next/server";
import { sql } from "@/lib/db";

export async function GET() {
  try {
    const query = sql();

    const images = await query`
      SELECT ri.id, ri.name, ri.file_name, ri.mime_type, ri.created_at,
             (SELECT COUNT(*) FROM matching_rules WHERE image_id = ri.id) as rules_count
      FROM repository_images ri
      ORDER BY ri.created_at DESC
    `;

    const rules = await query`
      SELECT id, image_id, brand_name, category, strain, strain_type,
             product_name_contains, priority, created_at
      FROM matching_rules
      ORDER BY priority DESC
    `;

    const rulesByImage = new Map<number, typeof rules>();
    for (const r of rules) {
      const imgId = r.image_id as number;
      const list = rulesByImage.get(imgId) ?? [];
      list.push(r);
      rulesByImage.set(imgId, list);
    }

    const result = images.map((img) => ({
      id: img.id,
      name: img.name,
      fileName: img.file_name,
      mimeType: img.mime_type,
      createdAt: img.created_at,
      rulesCount: Number(img.rules_count),
      rules: (rulesByImage.get(img.id as number) ?? []).map((r) => ({
        id: r.id,
        imageId: r.image_id,
        brandName: r.brand_name,
        category: r.category,
        strain: r.strain,
        strainType: r.strain_type,
        productNameContains: r.product_name_contains,
        priority: r.priority,
        createdAt: r.created_at,
      })),
    }));

    return Response.json(result);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to list images";
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}

export async function POST(req: NextRequest) {
  try {
    const { name, base64Image, fileName, mimeType } = (await req.json()) as {
      name: string;
      base64Image: string;
      fileName: string;
      mimeType: string;
    };

    if (!name || !base64Image || !fileName || !mimeType) {
      return new Response(
        JSON.stringify({
          error: "name, base64Image, fileName, and mimeType are required",
        }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    const imageBuffer = Buffer.from(base64Image, "base64");
    const query = sql();

    const result = await query`
      INSERT INTO repository_images (name, file_name, mime_type, image_data)
      VALUES (${name}, ${fileName}, ${mimeType}, ${imageBuffer})
      RETURNING id
    `;

    return Response.json({
      id: result[0].id,
      name,
      fileName,
      mimeType,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to upload image";
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
