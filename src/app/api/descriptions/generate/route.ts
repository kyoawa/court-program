import { NextRequest } from "next/server";
import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

interface GenerateRequest {
  productName: string | null;
  brandName: string | null;
  category: string | null;
  strain: string | null;
  strainType: string | null;
  size: string | null;
}

export async function POST(req: NextRequest) {
  try {
    const product = (await req.json()) as GenerateRequest;

    if (!product.productName) {
      return new Response(
        JSON.stringify({ error: "productName is required" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    const details: string[] = [];
    if (product.brandName) details.push(`Brand: ${product.brandName}`);
    if (product.category) details.push(`Category: ${product.category}`);
    if (product.strain) details.push(`Strain: ${product.strain}`);
    if (product.strainType) details.push(`Strain Type: ${product.strainType}`);
    if (product.size) details.push(`Size: ${product.size}`);

    const productInfo =
      details.length > 0 ? `\n${details.join("\n")}` : "";

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: `You are a knowledgeable cannabis dispensary copywriter. You write concise, informative product descriptions for a dispensary's product catalog.

Your descriptions should:
- Be 2-3 sentences long
- Sound professional and informative
- Identify what the product actually is based on the name and context (e.g. "Lookah Cat" is a Cat-shaped vaporizer by Lookah, strain names refer to cannabis flower/concentrates, etc.)
- Include relevant strain info, effects, or product details when available
- Be written for adult cannabis consumers
- NEVER include potency, THC/CBD percentages, milligram counts, or dosage information — these change between batches and must not be in descriptions
- Not include any medical claims`,
        },
        {
          role: "user",
          content: `Write a product description for: ${product.productName}${productInfo}`,
        },
      ],
      temperature: 0.7,
      max_tokens: 200,
    });

    const description =
      completion.choices[0]?.message?.content?.trim() ?? "";

    return new Response(JSON.stringify({ description }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to generate description";
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
