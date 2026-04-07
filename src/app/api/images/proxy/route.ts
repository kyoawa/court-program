import { NextRequest } from "next/server";

export async function POST(req: NextRequest) {
  try {
    const { url } = (await req.json()) as { url: string };

    if (!url || typeof url !== "string") {
      return new Response(
        JSON.stringify({ error: "url is required" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    const response = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
        Accept: "image/*,*/*;q=0.8",
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch image: ${response.status}`);
    }

    const contentType = response.headers.get("content-type") || "image/jpeg";
    const arrayBuffer = await response.arrayBuffer();
    const base64 = Buffer.from(arrayBuffer).toString("base64");

    // Normalize MIME type
    let mimeType = contentType.split(";")[0].trim();
    if (!["image/jpeg", "image/png", "image/webp"].includes(mimeType)) {
      mimeType = "image/jpeg";
    }

    return Response.json({ base64, mimeType });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to proxy image";
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
