import { cleanProductName } from "./search-query";
import type { ImageSearchResult, ProductSearchRequest } from "./types";

/**
 * Finds the official product image other companies publish on their Dutchie
 * menus and Leafly brand pages. A web search scoped to each site turns up
 * candidate product pages; each page's og:image (or JSON-LD / CDN image) is
 * the image a brand uploaded for that product.
 */
export type BrandSource = "Leafly" | "Dutchie";

export interface WebSearchHit {
  url: string;
  title?: string;
}

export interface BrandImageDependencies {
  /**
   * Site-scoped web search; returns page hits in rank order. Optional: without
   * it only Leafly is searched, directly through its public brand pages.
   */
  webSearch?: (query: string) => Promise<WebSearchHit[]>;
  /** Fetches a product page's HTML, or null when it cannot be read. */
  fetchPage: (url: string) => Promise<string | null>;
}

const SOURCE_DOMAINS: Record<BrandSource, string> = {
  Leafly: "leafly.com",
  Dutchie: "dutchie.com",
};

/** Pages on these hosts are the only ones the finder will open. */
export function isAllowedProductPage(url: string): boolean {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:") return false;
    return Object.values(SOURCE_DOMAINS).some(
      (domain) => parsed.hostname === domain || parsed.hostname.endsWith(`.${domain}`),
    );
  } catch {
    return false;
  }
}

export function sourceForUrl(url: string): BrandSource | null {
  try {
    const host = new URL(url).hostname;
    for (const [source, domain] of Object.entries(SOURCE_DOMAINS) as [BrandSource, string][]) {
      if (host === domain || host.endsWith(`.${domain}`)) return source;
    }
  } catch {
    // not a URL
  }
  return null;
}

/** True for URLs that look like a single product page rather than a menu or brand index. */
export function looksLikeProductPage(url: string): boolean {
  const path = (() => { try { return new URL(url).pathname.toLowerCase(); } catch { return ""; } })();
  return /\/product(s)?\/[^/]+/.test(path);
}

export function buildBrandQueries(product: Pick<ProductSearchRequest, "productName" | "brandName">): Record<BrandSource, string> {
  const name = cleanProductName(product.productName ?? "").trim();
  const brand = (product.brandName ?? "").trim();
  const brandTerm = brand ? `"${brand}" ` : "";
  return {
    Leafly: `site:leafly.com/brands ${brandTerm}${name}`.trim(),
    Dutchie: `site:dutchie.com ${brandTerm}${name}`.trim(),
  };
}

const CDN_IMAGE_PATTERN =
  /https?:\/\/(?:images\.dutchie\.com|images\.leafly\.com|leafly-public\.imgix\.net|public\.leafly\.com|leafly-cms-production\.imgix\.net)\/[^\s"'<>)]+/gi;

function decodeEntities(value: string): string {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function metaContent(html: string, keys: string[]): string[] {
  const found: string[] = [];
  for (const key of keys) {
    const patterns = [
      new RegExp(`<meta[^>]+(?:property|name)=["']${key}["'][^>]*content=["']([^"']+)["']`, "gi"),
      new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]*(?:property|name)=["']${key}["']`, "gi"),
    ];
    for (const pattern of patterns) {
      for (const match of html.matchAll(pattern)) found.push(decodeEntities(match[1]));
    }
  }
  return found;
}

function jsonLdImages(html: string): string[] {
  const images: string[] = [];
  const collect = (value: unknown) => {
    if (!value) return;
    if (typeof value === "string") images.push(value);
    else if (Array.isArray(value)) value.forEach(collect);
    else if (typeof value === "object") {
      const record = value as Record<string, unknown>;
      if (typeof record.url === "string") images.push(record.url);
      else if (typeof record.contentUrl === "string") images.push(record.contentUrl);
    }
  };
  const walk = (node: unknown) => {
    if (!node || typeof node !== "object") return;
    if (Array.isArray(node)) { node.forEach(walk); return; }
    const record = node as Record<string, unknown>;
    if ("image" in record) collect(record.image);
    for (const key of ["@graph", "mainEntity", "itemListElement", "item"]) {
      if (key in record) walk(record[key]);
    }
  };
  for (const match of html.matchAll(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      walk(JSON.parse(match[1].trim()));
    } catch {
      // malformed JSON-LD is ignored
    }
  }
  return images;
}

function absolute(url: string, pageUrl: string): string | null {
  try {
    const resolved = new URL(url, pageUrl);
    return resolved.protocol === "https:" || resolved.protocol === "http:" ? resolved.toString() : null;
  } catch {
    return null;
  }
}

/** Product image URLs from a page, best first. */
export function extractProductImages(html: string, pageUrl: string): string[] {
  const ordered = [
    ...metaContent(html, ["og:image", "og:image:secure_url", "twitter:image", "twitter:image:src"]),
    ...jsonLdImages(html),
    ...Array.from(html.matchAll(CDN_IMAGE_PATTERN)).map((match) => decodeEntities(match[0])),
  ];
  const seen = new Set<string>();
  const images: string[] = [];
  for (const candidate of ordered) {
    const url = absolute(candidate, pageUrl);
    if (!url || seen.has(url)) continue;
    // Skip site chrome such as logos and social share images.
    if (/logo|favicon|sprite|icon|placeholder|share-image|opengraph-default/i.test(url)) continue;
    seen.add(url);
    images.push(url);
  }
  return images;
}

function pageTitle(html: string): string {
  const og = metaContent(html, ["og:title"])[0];
  if (og) return og;
  const match = html.match(/<title[^>]*>([^<]*)<\/title>/i);
  return match ? decodeEntities(match[1]).trim() : "";
}

export interface FindBrandImagesOptions {
  /** Pages opened per source; the first product image of each page is used. */
  pagesPerSource?: number;
  maxResults?: number;
}

export interface BrandImageOutcome {
  images: ImageSearchResult[];
  /** Explains a source that could not be searched, for the UI. */
  note?: string;
}

/* ----------------------- Leafly brand pages (no key) ----------------------- */

/** Leafly's brand slug: "Kiva Confections" -> "kiva-confections". */
export function leaflyBrandSlug(brand: string): string {
  return brand
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/['’.]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function leaflyBrandPages(brand: string): string[] {
  const slug = leaflyBrandSlug(brand);
  if (!slug) return [];
  return [
    `https://www.leafly.com/brands/${slug}`,
    `https://www.leafly.com/brands/${slug}/products`,
  ];
}

function stripTags(html: string): string {
  return decodeEntities(html.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
}

/** Product links on a Leafly brand page, with the best title we can read. */
export function extractLeaflyProductLinks(html: string, brand: string): WebSearchHit[] {
  const slug = leaflyBrandSlug(brand);
  const hits = new Map<string, WebSearchHit>();
  const anchor = /<a\b([^>]*)href=["']([^"']*\/brands\/([a-z0-9-]+)\/products\/([^"'?#]+))[^"']*["']([^>]*)>([\s\S]*?)<\/a>/gi;
  for (const match of html.matchAll(anchor)) {
    const [, before, href, linkSlug, productSlug, after, inner] = match;
    if (slug && linkSlug !== slug) continue;
    const url = absolute(href, "https://www.leafly.com/");
    if (!url) continue;
    const key = url.replace(/[?#].*$/, "");
    const titleAttr = `${before} ${after}`.match(/(?:title|aria-label)=["']([^"']+)["']/i)?.[1];
    const text = titleAttr ? decodeEntities(titleAttr) : stripTags(inner);
    const title = text || productSlug.replace(/-/g, " ");
    const existing = hits.get(key);
    if (!existing || (existing.title?.length ?? 0) < title.length) hits.set(key, { url: key, title });
  }
  return Array.from(hits.values());
}

const STOP_WORDS = new Set(["the", "and", "of", "a", "an", "with", "by", "cannabis", "pre", "roll", "prerolls", "pre-roll"]);

function tokens(value: string): string[] {
  return cleanProductName(value)
    .toLowerCase()
    .split(/[^a-z0-9.]+/)
    .filter((token) => token.length > 1 && !STOP_WORDS.has(token));
}

/** Orders candidate pages by how many product-name words they share; drops non-matches. */
export function rankProductMatches(productName: string, hits: WebSearchHit[]): WebSearchHit[] {
  const wanted = tokens(productName);
  if (!wanted.length) return hits;
  return hits
    .map((hit) => {
      const have = new Set([...tokens(hit.title ?? ""), ...tokens(hit.url.split("/").pop()?.replace(/-/g, " ") ?? "")]);
      const score = wanted.filter((token) => have.has(token)).length;
      return { hit, score };
    })
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score)
    .map(({ hit }) => hit);
}

async function imagesFromPages(
  pages: WebSearchHit[],
  source: BrandSource,
  fetchPage: BrandImageDependencies["fetchPage"],
): Promise<ImageSearchResult[]> {
  const results: ImageSearchResult[] = [];
  await Promise.all(pages.map(async (hit) => {
    const html = await fetchPage(hit.url).catch(() => null);
    if (!html) return;
    const [image] = extractProductImages(html, hit.url);
    if (!image) return;
    results.push({ originalUrl: image, thumbnailUrl: image, title: pageTitle(html) || hit.title || "", source, pageUrl: hit.url });
  }));
  // Keep the candidate ranking rather than fetch completion order.
  return results.sort((a, b) => pages.findIndex((p) => p.url === a.pageUrl) - pages.findIndex((p) => p.url === b.pageUrl));
}

async function findLeaflyDirect(
  product: ProductSearchRequest,
  deps: BrandImageDependencies,
  pagesPerSource: number,
): Promise<ImageSearchResult[]> {
  if (!product.brandName) return [];
  const links = new Map<string, WebSearchHit>();
  for (const page of leaflyBrandPages(product.brandName)) {
    const html = await deps.fetchPage(page).catch(() => null);
    if (!html) continue;
    for (const hit of extractLeaflyProductLinks(html, product.brandName)) links.set(hit.url, hit);
  }
  const ranked = rankProductMatches(product.productName, Array.from(links.values())).slice(0, pagesPerSource);
  return imagesFromPages(ranked, "Leafly", deps.fetchPage);
}

async function findViaWebSearch(
  product: ProductSearchRequest,
  source: BrandSource,
  deps: BrandImageDependencies,
  pagesPerSource: number,
): Promise<ImageSearchResult[]> {
  if (!deps.webSearch) return [];
  const query = buildBrandQueries(product)[source];
  const hits = await deps.webSearch(query).catch(() => [] as WebSearchHit[]);
  const onSite = hits.filter((hit) => isAllowedProductPage(hit.url) && sourceForUrl(hit.url) === source);
  const productPages = onSite.filter((hit) => looksLikeProductPage(hit.url));
  return imagesFromPages((productPages.length ? productPages : onSite).slice(0, pagesPerSource), source, deps.fetchPage);
}

export const DUTCHIE_NEEDS_SEARCH_NOTE =
  "Dutchie menus were not searched: set BRAVE_SEARCH_API_KEY (Brave's free tier works) to include them. Leafly was searched directly.";

export async function findBrandImages(
  product: ProductSearchRequest,
  deps: BrandImageDependencies,
  options: FindBrandImagesOptions = {},
): Promise<BrandImageOutcome> {
  const pagesPerSource = options.pagesPerSource ?? 4;
  const maxResults = options.maxResults ?? 8;

  let leafly = await findLeaflyDirect(product, deps, pagesPerSource);
  if (!leafly.length) leafly = await findViaWebSearch(product, "Leafly", deps, pagesPerSource);
  const dutchie = await findViaWebSearch(product, "Dutchie", deps, pagesPerSource);

  // Interleave sources so both are represented when results are capped.
  const merged: ImageSearchResult[] = [];
  const seen = new Set<string>();
  for (let i = 0; merged.length < maxResults; i++) {
    let added = false;
    for (const results of [dutchie, leafly]) {
      const result = results[i];
      if (!result || seen.has(result.originalUrl)) continue;
      seen.add(result.originalUrl);
      merged.push(result);
      added = true;
      if (merged.length >= maxResults) break;
    }
    if (!added) break;
  }
  return { images: merged, note: deps.webSearch ? undefined : DUTCHIE_NEEDS_SEARCH_NOTE };
}
