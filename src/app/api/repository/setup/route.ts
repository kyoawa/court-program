import { initSchema } from "@/lib/db";

export async function POST() {
  try {
    await initSchema();
    return Response.json({ success: true, message: "Schema initialized" });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to initialize schema";
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
