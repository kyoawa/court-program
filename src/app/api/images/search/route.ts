import { NextRequest } from "next/server";
import { buildSearchQuery, cleanProductName } from "@/lib/search-query";
import {
  IMAGE_SEARCH_DELAY_MS,
  IMAGE_SEARCH_MAX_RESULTS,
} from "@/lib/constants";
import {
  findBrandImages,
  isAllowedProductPage,
  type WebSearchHit,
} from "@/lib/brand-image-finder";
import type { ImageSearchResult, ImageSearchSource, ProductSearchRequest } from "@/lib/types";

const PAGE_FETCH_TIMEOUT_MS = 10000;
const PAGE_MAX_BYTES = 2 * 1024 * 1024;
const BROWSER_USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

/** Site-scoped Brave web search, used to find Dutchie menu and Leafly product pages. */
async function braveWebSearch(query: string): Promise<WebSearchHit[]> {
  const apiKey = process.env.BRAVE_SEARCH_API_KEY;
  if (!apiKey) return [];
  const params = new URLSearchParams({ q: query, count: "10", safesearch: "off" });
  const response = await fetch(`https://api.search.brave.com/res/v1/web/search?${params}`, {
    headers: { Accept: "application/json", "Accept-Encoding": "gzip", "X-Subscription-Token": apiKey },
    signal: AbortSignal.timeout(PAGE_FETCH_TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`Brave API error ${response.status}`);
  const data = await response.json();
  return ((data.web?.results ?? []) as { url?: string; title?: string }[])
    .filter((hit) => typeof hit.url === "string")
    .map((hit) => ({ url: hit.url as string, title: hit.title }));
}

/** Reads a Dutchie or Leafly product page. Other hosts are never fetched. */
async function fetchProductPage(url: string): Promise<string | null> {
  if (!isAllowedProductPage(url)) return null;
  const response = await fetch(url, {
    headers: { "User-Agent": BROWSER_USER_AGENT, Accept: "text/html,application/xhtml+xml", "Accept-Language": "en-US,en;q=0.9" },
    redirect: "follow",
    signal: AbortSignal.timeout(PAGE_FETCH_TIMEOUT_MS),
  });
  if (!response.ok || !response.body) return null;
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (size < PAGE_MAX_BYTES) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    size += value.byteLength;
  }
  await reader.cancel().catch(() => undefined);
  return Buffer.concat(chunks).toString("utf8");
}

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

  type BraveImage = { properties?: { url?: string }; thumbnail?: { src?: string }; title?: string; source?: string };
  return ((data.results || []) as BraveImage[]).slice(0, maxResults).map((r) => ({
    originalUrl: r.properties?.url || r.thumbnail?.src || "",
    thumbnailUrl: r.thumbnail?.src || r.properties?.url || "",
    title: r.title || "",
    source: r.source || "",
  }));
}

const CONCURRENCY = 3;

export async function POST(req: NextRequest) {
  try {
    const { products, source: requestedSource } = (await req.json()) as {
      products: ProductSearchRequest[];
      source?: ImageSearchSource;
    };
    const source: ImageSearchSource = requestedSource === "web" ? "web" : "brand";
    const hasWebSearch = Boolean(process.env.BRAVE_SEARCH_API_KEY);

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

          const query = product.customQuery?.trim() ||
            (source === "brand"
              ? [product.brandName, cleanProductName(product.productName ?? "")].filter(Boolean).join(" ")
              : buildSearchQuery(product));

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
            let images: ImageSearchResult[];
            let note: string | undefined;
            if (source === "brand") {
              // A custom query replaces the product name for the page lookup.
              const target = product.customQuery?.trim()
                ? { ...product, productName: product.customQuery.trim() }
                : product;
              const outcome = await findBrandImages(target, {
                fetchPage: fetchProductPage,
                webSearch: hasWebSearch ? braveWebSearch : undefined,
              }, { maxResults: IMAGE_SEARCH_MAX_RESULTS });
              images = outcome.images;
              note = outcome.note;
            } else {
              images = await searchBraveImages(query, IMAGE_SEARCH_MAX_RESULTS);
            }

            controller.enqueue(
              encoder.encode(
                encode({
                  type: "results",
                  productId: product.productId,
                  images,
                  note,
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
