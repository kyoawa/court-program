import { NextRequest } from "next/server";
import * as cheerio from "cheerio";
import { buildSearchQuery } from "@/lib/search-query";
import {
  IMAGE_SEARCH_DELAY_MS,
  IMAGE_SEARCH_MAX_RESULTS,
} from "@/lib/constants";
import type { ImageSearchResult, ProductSearchRequest } from "@/lib/types";

const USER_AGENTS = [
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
];

function encode(data: Record<string, unknown>): string {
  return `data: ${JSON.stringify(data)}\n\n`;
}

function randomUserAgent(): string {
  return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function scrapeGoogleImages(
  query: string,
  maxResults: number
): Promise<ImageSearchResult[]> {
  const url = `https://www.google.com/search?q=${encodeURIComponent(query)}&tbm=isch&hl=en`;

  const response = await fetch(url, {
    headers: {
      "User-Agent": randomUserAgent(),
      Accept:
        "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
      "Accept-Language": "en-US,en;q=0.5",
    },
  });

  if (!response.ok) {
    throw new Error(`Google returned ${response.status}`);
  }

  const html = await response.text();

  if (html.includes("unusual traffic") || html.includes("captcha")) {
    throw new Error("Rate limited by Google. Try again later.");
  }

  const results: ImageSearchResult[] = [];
  const seen = new Set<string>();

  // Strategy 1: Extract full-size image URLs from embedded data in the HTML
  // Google embeds image URLs as ["URL", height, width] arrays throughout the page
  const urlMatches = html.matchAll(
    /\["(https?:\/\/[^"]+?\.(?:jpg|jpeg|png|webp)(?:\?[^"]*)?)",\s*(\d+),\s*(\d+)\]/gi
  );
  for (const urlMatch of urlMatches) {
    // Unescape unicode sequences like \u003d -> =
    const imageUrl = urlMatch[1].replace(
      /\\u([0-9a-fA-F]{4})/g,
      (_, code) => String.fromCharCode(parseInt(code, 16))
    );
    if (
      !imageUrl.includes("gstatic.com") &&
      !imageUrl.includes("google.com") &&
      !seen.has(imageUrl)
    ) {
      seen.add(imageUrl);
      results.push({
        originalUrl: imageUrl,
        thumbnailUrl: imageUrl,
        title: "",
      });
    }
    if (results.length >= maxResults) break;
  }

  // Strategy 2: Fallback - parse img tags with cheerio
  if (results.length === 0) {
    const $ = cheerio.load(html);
    $("img").each((_, el) => {
      if (results.length >= maxResults) return false;
      const src = $(el).attr("src") || $(el).attr("data-src");
      if (
        src &&
        src.startsWith("http") &&
        !src.includes("gstatic.com") &&
        !src.includes("google.com") &&
        !seen.has(src)
      ) {
        seen.add(src);
        results.push({
          originalUrl: src,
          thumbnailUrl: src,
          title: $(el).attr("alt") || "",
        });
      }
    });
  }

  return results.slice(0, maxResults);
}

export async function POST(req: NextRequest) {
  try {
    const { products } = (await req.json()) as {
      products: ProductSearchRequest[];
    };

    if (!products || !Array.isArray(products) || products.length === 0) {
      return new Response(
        JSON.stringify({ error: "products array is required" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    const stream = new ReadableStream({
      async start(controller) {
        const encoder = new TextEncoder();

        for (let i = 0; i < products.length; i++) {
          const product = products[i];
          const query = buildSearchQuery(product);

          controller.enqueue(
            encoder.encode(
              encode({
                type: "searching",
                productId: product.productId,
                query,
              })
            )
          );

          try {
            const images = await scrapeGoogleImages(
              query,
              IMAGE_SEARCH_MAX_RESULTS
            );

            controller.enqueue(
              encoder.encode(
                encode({
                  type: "results",
                  productId: product.productId,
                  images,
                })
              )
            );
          } catch (error) {
            controller.enqueue(
              encoder.encode(
                encode({
                  type: "search_error",
                  productId: product.productId,
                  error:
                    error instanceof Error ? error.message : "Search failed",
                })
              )
            );
          }

          // Delay between requests to avoid rate limiting
          if (i < products.length - 1) {
            await delay(IMAGE_SEARCH_DELAY_MS);
          }
        }

        controller.enqueue(encoder.encode(encode({ type: "done" })));
        controller.close();
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to process search";
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
