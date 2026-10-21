/**
 * Server-side fetching of third-party pages and images for brand source
 * scans. Only public https hosts are allowed so a saved URL cannot reach
 * Railway's private network or the container itself.
 */
const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";
const TIMEOUT_MS = 15_000;
const HTML_MAX_BYTES = 3 * 1024 * 1024;

export function isPublicHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    if (!/^https?:$/.test(url.protocol)) return false;
    const host = url.hostname.toLowerCase();
    if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".internal") || host.endsWith(".local")) return false;
    if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host) || host.includes(":")) return false; // IP literals
    return host.includes(".");
  } catch {
    return false;
  }
}

async function readCapped(response: Response, maxBytes: number): Promise<Buffer | null> {
  const reader = response.body?.getReader();
  if (!reader) return null;
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > maxBytes) {
      await reader.cancel().catch(() => undefined);
      return null;
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks);
}

/**
 * Per-site cookie jar for one crawl: holds the cookies the user pasted for a
 * source plus any the site sets while crawling. Cookies are keyed by host
 * (www. stripped) and are never sent to a different site.
 */
export class CookieJar {
  private cookies = new Map<string, Map<string, string>>();

  private key(url: string): string {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, "");
  }

  /** Adds cookies from a Cookie-header style string ("a=1; b=2") for a site. */
  addHeader(url: string, header: string | null | undefined) {
    if (!header) return;
    const site = this.cookies.get(this.key(url)) ?? new Map<string, string>();
    for (const part of header.split(";")) {
      const index = part.indexOf("=");
      if (index <= 0) continue;
      site.set(part.slice(0, index).trim(), part.slice(index + 1).trim());
    }
    this.cookies.set(this.key(url), site);
  }

  /** Records Set-Cookie headers from a response. */
  addSetCookies(url: string, setCookies: string[]) {
    for (const raw of setCookies) this.addHeader(url, raw.split(";")[0]);
  }

  header(url: string): string | undefined {
    const site = this.cookies.get(this.key(url));
    if (!site?.size) return undefined;
    return Array.from(site.entries()).map(([name, value]) => `${name}=${value}`).join("; ");
  }
}

function pageHeaders(url: string, jar?: CookieJar): Record<string, string> {
  const headers: Record<string, string> = {
    "User-Agent": USER_AGENT,
    Accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
  };
  const cookie = jar?.header(url);
  if (cookie) headers.Cookie = cookie;
  return headers;
}

export async function fetchHtml(url: string, options: { jar?: CookieJar } = {}): Promise<string | null> {
  if (!isPublicHttpUrl(url)) return null;
  // Redirects are followed by hand so cookies set on each hop are kept.
  let current = url;
  for (let hop = 0; hop < 6; hop++) {
    const response = await fetch(current, {
      headers: pageHeaders(current, options.jar),
      redirect: "manual",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    options.jar?.addSetCookies(current, response.headers.getSetCookie?.() ?? []);
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (!location) return null;
      const next = new URL(location, current).toString();
      if (!isPublicHttpUrl(next)) return null;
      current = next;
      continue;
    }
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const type = response.headers.get("content-type") ?? "";
    if (type && !/html|xml/i.test(type)) return null;
    const bytes = await readCapped(response, HTML_MAX_BYTES);
    return bytes ? bytes.toString("utf8") : null;
  }
  return null;
}

export async function fetchImage(url: string, maxBytes: number): Promise<{ buffer: Buffer; mimeType: string }> {
  if (!isPublicHttpUrl(url)) throw new Error("Only public http(s) image URLs can be imported.");
  const response = await fetch(url, {
    headers: { "User-Agent": USER_AGENT, Accept: "image/*,*/*;q=0.8" },
    redirect: "follow",
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`Image download failed (HTTP ${response.status})`);
  const mimeType = (response.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
  if (!mimeType.startsWith("image/")) throw new Error("The URL did not return an image.");
  const buffer = await readCapped(response, maxBytes);
  if (!buffer) throw new Error("Image exceeds the size limit.");
  return { buffer, mimeType };
}
