import { extractProductImages, pageTitle } from "./brand-image-finder";
import { cleanProductName } from "./search-query";

/**
 * Crawls a saved brand page for product images: the page itself, its
 * pagination, and one level of product links on the same site. Pure apart
 * from the injected page fetcher, so it is testable without a network.
 */
export interface CrawlSource {
  url: string;
  /** Only follow links whose path starts with this, e.g. "/collections/pre-rolls". */
  pathPrefix?: string | null;
}

export interface CrawlCandidate {
  imageUrl: string;
  title: string;
  pageUrl: string;
  /** True when the image is a product page's main image rather than a gallery thumbnail. */
  fromProductPage: boolean;
}

export interface CrawlOptions {
  maxPages?: number;
  concurrency?: number;
  delayMs?: number;
  timeBudgetMs?: number;
}

export interface CrawlProgress {
  pagesVisited: number;
  queued: number;
  candidates: number;
}

export interface CrawlResult {
  candidates: CrawlCandidate[];
  pagesVisited: number;
  truncated: boolean;
  truncatedReason?: "pages" | "time";
  errors: { url: string; error: string }[];
}

export interface CrawlDependencies {
  fetchPage: (url: string) => Promise<string | null>;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
}

const DEFAULTS: Required<CrawlOptions> = { maxPages: 150, concurrency: 3, delayMs: 250, timeBudgetMs: 120_000 };

/* ------------------------------- URL helpers ------------------------------ */

function hostKey(hostname: string): string {
  return hostname.toLowerCase().replace(/^www\./, "");
}

export function isSameSite(url: string, start: string): boolean {
  try {
    return hostKey(new URL(url).hostname) === hostKey(new URL(start).hostname);
  } catch {
    return false;
  }
}

export function normalizePageUrl(url: string): string {
  const parsed = new URL(url);
  parsed.hash = "";
  for (const key of Array.from(parsed.searchParams.keys())) {
    if (/^(utm_|fbclid|gclid|ref$)/i.test(key)) parsed.searchParams.delete(key);
  }
  if (parsed.pathname.length > 1) parsed.pathname = parsed.pathname.replace(/\/+$/, "");
  return parsed.toString();
}

function withinPrefix(url: string, prefix: string | null | undefined): boolean {
  if (!prefix) return true;
  const clean = `/${prefix.replace(/^\/+|\/+$/g, "")}`;
  const path = new URL(url).pathname;
  return path === clean || path.startsWith(`${clean}/`);
}

const SKIP_PATH = /\/(cart|checkout|account|login|signin|register|search|tag|tags|blog|blogs|news|about|contact|faq|policies|privacy|terms|wishlist)(\/|$)/i;
const FILE_EXT = /\.(pdf|jpe?g|png|gif|webp|svg|zip|mp4|css|js)(\?|$)/i;
const PRODUCT_PATH = /\/(products?|shop|items?|menu|p|store|catalog)\/[^/?#]+/i;

export function isProductLink(url: string, anchorHtml = ""): boolean {
  try {
    const parsed = new URL(url);
    if (!/^https?:$/.test(parsed.protocol)) return false;
    if (SKIP_PATH.test(parsed.pathname) || FILE_EXT.test(parsed.pathname)) return false;
    if (PRODUCT_PATH.test(parsed.pathname)) return true;
    return /<img\b/i.test(anchorHtml) && parsed.pathname.length > 1;
  } catch {
    return false;
  }
}

export function isPaginationLink(url: string, listingUrl: string, rel = ""): boolean {
  try {
    const parsed = new URL(url);
    const listing = new URL(listingUrl);
    if (hostKey(parsed.hostname) !== hostKey(listing.hostname)) return false;
    if (/\bnext\b/i.test(rel)) return true;
    const samePath = parsed.pathname.replace(/\/page\/\d+\/?$/i, "") === listing.pathname.replace(/\/page\/\d+\/?$/i, "");
    return samePath && (/^\d+$/.test(parsed.searchParams.get("page") ?? "") || /\/page\/\d+\/?$/i.test(parsed.pathname));
  } catch {
    return false;
  }
}

/** Removes CDN size variants so the same picture dedupes and the original is kept. */
export function canonicalImageUrl(url: string): string {
  try {
    const parsed = new URL(url);
    // Shopify: name_600x600.jpg, name_1024x.jpg, name_x800.jpg
    parsed.pathname = parsed.pathname.replace(/_(\d+x\d*|x\d+)(_crop_[a-z]+)?(@\dx)?(\.[a-z0-9]+)$/i, "$4");
    // Query strings carry sizes and cache-busters (?v=), never a different picture.
    parsed.search = "";
    parsed.hash = "";
    return parsed.toString();
  } catch {
    return url;
  }
}

/* ------------------------------ HTML helpers ------------------------------ */

function decode(value: string): string {
  return value.replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&nbsp;/g, " ");
}

function attr(tag: string, name: string): string | undefined {
  const match = tag.match(new RegExp(`\\s${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, "i"));
  return match ? decode(match[1] ?? match[2] ?? match[3] ?? "") : undefined;
}

function text(html: string): string {
  return decode(html.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
}

/** og:title when present; otherwise the <title> with a " | Site" or " – Site" suffix removed. */
export function productPageTitle(html: string): string {
  const og = html.match(/<meta[^>]+property=["']og:title["'][^>]*content=["']([^"']+)["']/i)
    ?? html.match(/<meta[^>]+content=["']([^"']+)["'][^>]*property=["']og:title["']/i);
  if (og) return decode(og[1]).trim();
  const title = html.match(/<title[^>]*>([^<]*)<\/title>/i);
  if (!title) return "";
  return decode(title[1]).replace(/\s+[|–—]\s+[^|–—]*$|\s+-\s+[^-]*$/, "").trim();
}

function absolute(href: string, base: string): string | null {
  try {
    const url = new URL(href.trim(), base);
    return /^https?:$/.test(url.protocol) ? url.toString() : null;
  } catch {
    return null;
  }
}

const JUNK_IMAGE = /logo|favicon|sprite|icon|placeholder|pixel|badge|payment|flag|avatar|loading|spinner|arrow|star|rating|social|instagram|facebook|twitter|\.svg(\?|$)|\.gif(\?|$)|^data:/i;

/** Picks the largest URL from a srcset; falls back to the last entry. */
export function largestFromSrcset(srcset: string): string | undefined {
  let best: { url: string; width: number } | undefined;
  for (const part of srcset.split(",")) {
    const [url, descriptor] = part.trim().split(/\s+/);
    if (!url) continue;
    const width = descriptor?.endsWith("w") ? parseInt(descriptor, 10) : descriptor?.endsWith("x") ? parseFloat(descriptor) * 1000 : 0;
    if (!best || width >= best.width) best = { url, width };
  }
  return best?.url;
}

export interface ExtractedLink { href: string; rel: string; inner: string }

export function extractLinks(html: string, baseUrl: string): ExtractedLink[] {
  const links: ExtractedLink[] = [];
  for (const match of html.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi)) {
    const [, attrs, inner] = match;
    const href = attr(`<a ${attrs}>`, "href");
    if (!href) continue;
    const abs = absolute(href, baseUrl);
    if (!abs) continue;
    links.push({ href: abs, rel: attr(`<a ${attrs}>`, "rel") ?? "", inner });
  }
  // <link rel="next"> pagination hints.
  for (const match of html.matchAll(/<link\b([^>]*)>/gi)) {
    const rel = attr(`<link ${match[1]}>`, "rel") ?? "";
    const href = attr(`<link ${match[1]}>`, "href");
    if (/\bnext\b/i.test(rel) && href) {
      const abs = absolute(href, baseUrl);
      if (abs) links.push({ href: abs, rel: "next", inner: "" });
    }
  }
  return links;
}

export interface GalleryImage { imageUrl: string; title: string; linkUrl: string | null }

function imageFromTag(tag: string, baseUrl: string): { url: string; alt: string } | null {
  const srcset = attr(tag, "data-srcset") ?? attr(tag, "srcset");
  const fromSet = srcset ? largestFromSrcset(srcset) : undefined;
  const src = fromSet ?? attr(tag, "data-src") ?? attr(tag, "data-original") ?? attr(tag, "src");
  if (!src || src.startsWith("data:")) return null;
  const abs = absolute(src.replace(/\{width\}/g, "1024"), baseUrl);
  if (!abs || JUNK_IMAGE.test(abs)) return null;
  const width = parseInt(attr(tag, "width") ?? "", 10);
  if (width && width < 80) return null;
  return { url: abs, alt: (attr(tag, "alt") ?? "").trim() };
}

/** Images on a listing page with the best nearby title and the product link that wraps them. */
export function extractGalleryImages(html: string, baseUrl: string): GalleryImage[] {
  const results = new Map<string, GalleryImage>();
  const inAnchor = new Set<string>();
  for (const match of html.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi)) {
    const [, attrs, inner] = match;
    const href = attr(`<a ${attrs}>`, "href");
    const link = href ? absolute(href, baseUrl) : null;
    const linkTitle = attr(`<a ${attrs}>`, "title") ?? attr(`<a ${attrs}>`, "aria-label");
    // Images that link off-site (social icons, partner badges) are not products.
    const offSite = link !== null && !isSameSite(link, baseUrl);
    for (const imgTag of inner.match(/<img\b[^>]*>/gi) ?? []) {
      inAnchor.add(imgTag);
      if (offSite) continue;
      const image = imageFromTag(imgTag, baseUrl);
      if (!image) continue;
      const title = image.alt || linkTitle || text(inner);
      const key = canonicalImageUrl(image.url);
      const existing = results.get(key);
      if (!existing || existing.title.length < title.length) {
        results.set(key, { imageUrl: image.url, title, linkUrl: link && isProductLink(link, inner) ? link : null });
      }
    }
  }
  for (const imgTag of html.match(/<img\b[^>]*>/gi) ?? []) {
    if (inAnchor.has(imgTag)) continue;
    const image = imageFromTag(imgTag, baseUrl);
    if (!image) continue;
    const key = canonicalImageUrl(image.url);
    if (!results.has(key)) results.set(key, { imageUrl: image.url, title: image.alt, linkUrl: null });
  }
  return Array.from(results.values());
}

/** Keywords for an auto-created matching rule: the title minus brand, dosage and filler words. */
const FILLER = new Set(["the", "and", "of", "a", "an", "with", "by", "for", "cannabis", "thc", "cbd", "product", "products", "image", "photo", "new", "pack"]);

export function keywordsFromTitle(title: string, brand: string | null | undefined): string[] {
  const brandTokens = new Set((brand ?? "").toLowerCase().split(/[^a-z0-9]+/).filter(Boolean));
  const seen = new Set<string>();
  return cleanProductName(title)
    .toLowerCase()
    .split(/[^a-z0-9.']+/)
    .map((token) => token.replace(/^'+|'+$/g, ""))
    .filter((token) => token.length > 1 && !FILLER.has(token) && !brandTokens.has(token) && !seen.has(token) && seen.add(token))
    .slice(0, 6);
}

/* --------------------------------- crawl ---------------------------------- */

export async function crawlBrandSource(
  source: CrawlSource,
  deps: CrawlDependencies,
  options: CrawlOptions = {},
  onProgress?: (progress: CrawlProgress) => void,
): Promise<CrawlResult> {
  const opts = { ...DEFAULTS, ...options };
  const now = deps.now ?? (() => Date.now());
  const sleep = deps.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  const start = normalizePageUrl(source.url);
  const startedAt = now();

  const queue: { url: string; kind: "listing" | "product" }[] = [{ url: start, kind: "listing" }];
  const seen = new Set<string>([start]);
  const candidates = new Map<string, CrawlCandidate>();
  const errors: CrawlResult["errors"] = [];
  let pagesVisited = 0;
  let truncated = false;
  let truncatedReason: CrawlResult["truncatedReason"];

  const addCandidate = (candidate: CrawlCandidate) => {
    const key = canonicalImageUrl(candidate.imageUrl);
    const existing = candidates.get(key);
    // A product page's own image wins over a gallery thumbnail of the same picture.
    if (!existing || (candidate.fromProductPage && !existing.fromProductPage) || (!existing.title && candidate.title)) {
      candidates.set(key, { ...candidate, imageUrl: existing?.fromProductPage ? existing.imageUrl : candidate.imageUrl });
    }
  };

  const enqueue = (url: string, kind: "listing" | "product") => {
    if (seen.has(url)) return;
    if (seen.size >= opts.maxPages) { truncated = true; truncatedReason = "pages"; return; }
    seen.add(url);
    queue.push({ url, kind });
  };

  const visit = async ({ url, kind }: { url: string; kind: "listing" | "product" }) => {
    let html: string | null = null;
    try {
      html = await deps.fetchPage(url);
    } catch (error) {
      errors.push({ url, error: (error as { message?: string } | null)?.message || "fetch failed" });
    }
    pagesVisited++;
    if (!html) {
      if (!errors.some((e) => e.url === url)) errors.push({ url, error: "page could not be read" });
      return;
    }
    if (kind === "product") {
      const [image] = extractProductImages(html, url);
      const title = productPageTitle(html) || pageTitle(html);
      if (image) addCandidate({ imageUrl: image, title, pageUrl: url, fromProductPage: true });
      else {
        const [gallery] = extractGalleryImages(html, url);
        if (gallery) addCandidate({ imageUrl: gallery.imageUrl, title: title || gallery.title, pageUrl: url, fromProductPage: true });
      }
      return;
    }
    for (const gallery of extractGalleryImages(html, url)) {
      addCandidate({ imageUrl: gallery.imageUrl, title: gallery.title, pageUrl: gallery.linkUrl ?? url, fromProductPage: false });
    }
    for (const link of extractLinks(html, url)) {
      let target: string;
      try { target = normalizePageUrl(link.href); } catch { continue; }
      if (!isSameSite(target, start) || target === url) continue;
      if (isPaginationLink(target, url, link.rel)) { enqueue(target, "listing"); continue; }
      if (!withinPrefix(target, source.pathPrefix)) continue;
      if (isProductLink(target, link.inner)) enqueue(target, "product");
    }
  };

  while (queue.length) {
    if (now() - startedAt > opts.timeBudgetMs) { truncated = true; truncatedReason = "time"; break; }
    const batch = queue.splice(0, opts.concurrency);
    await Promise.all(batch.map(visit));
    onProgress?.({ pagesVisited, queued: queue.length, candidates: candidates.size });
    if (queue.length) await sleep(opts.delayMs);
  }

  return { candidates: Array.from(candidates.values()), pagesVisited, truncated, truncatedReason, errors };
}

/* -------------------------------- age gates -------------------------------- */

const GATE_WORDS = /age[\s_-]?(gate|verif|check|confirm)|are you (21|18|19|over|of legal)|must be (21|18|19)|(21|18|19)\+? (years|or older)|verify your age|confirm your age|enter your (date of birth|birth)/i;

/**
 * True when a page reads like an age confirmation rather than content: gate
 * wording and little product material. Used only to tell the user that the
 * site needs their browser cookies before it will show products.
 */
export function looksLikeAgeGate(html: string): boolean {
  if (!GATE_WORDS.test(html)) return false;
  const productLinks = (html.match(/href=["'][^"']*\/(products?|shop|item|menu)\//gi) ?? []).length;
  const images = (html.match(/<img\b/gi) ?? []).length;
  return productLinks < 3 && images < 12;
}
