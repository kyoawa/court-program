export async function POST() {
  return Response.json(
    { error: "Description features are temporarily disabled." },
    { status: 503 }
  );
}
