import { NextRequest } from "next/server";
import { buildSearchQuery } from "@/lib/search-query";
import {
  IMAGE_SEARCH_DELAY_MS,
  IMAGE_SEARCH_MAX_RESULTS,
} from "@/lib/constants";
import type { ImageSearchResult, ProductSearchRequest } from "@/lib/types";

function encode(data: Record<string, unknown>): string {
  return `data: ${JSON.stringify(data)}\n\n`;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function searchBraveImages(
  query: string,
  maxResults: number
): Promise<ImageSearchResult[]> {
  const apiKey = process.env.BRAVE_SEARCH_API_KEY;
  if (!apiKey) {
    throw new Error("BRAVE_SEARCH_API_KEY is not configured");
  }

  const params = new URLSearchParams({
    q: query,
    count: String(Math.min(maxResults, 20)),
    safesearch: "off",
  });

  const response = await fetch(
    `https://api.search.brave.com/res/v1/images/search?${params}`,
    {
      headers: {
        "Accept": "application/json",
        "Accept-Encoding": "gzip",
        "X-Subscription-Token": apiKey,
      },
    }
  );

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Brave API error ${response.status}: ${text}`);
  }

  const data = await response.json();

  return (data.results || []).slice(0, maxResults).map((r: any) => ({
    originalUrl: r.properties?.url || r.thumbnail?.src || "",
    thumbnailUrl: r.thumbnail?.src || r.properties?.url || "",
    title: r.title || "",
    source: r.source || "",
  }));
}

const CONCURRENCY = 3;

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

        async function processProduct(product: ProductSearchRequest, index: number) {
          // Stagger requests: each slot waits its offset before starting
          if (index >= CONCURRENCY) {
            await delay(IMAGE_SEARCH_DELAY_MS);
          }

          const query = product.customQuery?.trim() || buildSearchQuery(product);

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
            const images = await searchBraveImages(
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
        }

        // Semaphore-based concurrency pool of CONCURRENCY
        let running = 0;
        let nextIndex = 0;
        const resolvers: (() => void)[] = [];

        function releaseSlot() {
          running--;
          const next = resolvers.shift();
          if (next) next();
        }

        async function acquireSlot(): Promise<void> {
          if (running < CONCURRENCY) {
            running++;
            return;
          }
          return new Promise<void>((resolve) => {
            resolvers.push(() => {
              running++;
              resolve();
            });
          });
        }

        const tasks: Promise<void>[] = [];
        for (let i = 0; i < products.length; i++) {
          await acquireSlot();
          const idx = nextIndex++;
          // Stagger start: each product in the pool gets a delay based on pool position
          const staggerDelay = idx < CONCURRENCY ? idx * IMAGE_SEARCH_DELAY_MS : IMAGE_SEARCH_DELAY_MS;
          const task = delay(staggerDelay)
            .then(() => processProduct(products[i], idx))
            .finally(releaseSlot);
          tasks.push(task);
        }

        await Promise.all(tasks);
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
