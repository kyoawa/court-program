import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
const HASH_RE = /[0-9a-f]{16,}/i;

// Best-effort parser for the imageId embedded in a Dutchie image URL.
// Tries: last meaningful path segment (sans extension), then UUID match, then long hex hash.
export function extractImageIdFromUrl(url: string): string | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    const segments = u.pathname.split("/").filter(Boolean);
    for (let i = segments.length - 1; i >= 0; i--) {
      const seg = segments[i].replace(/\.[^./]+$/, "");
      if (UUID_RE.test(seg)) {
        const m = seg.match(UUID_RE);
        if (m) return m[0];
      }
      if (HASH_RE.test(seg)) {
        const m = seg.match(HASH_RE);
        if (m) return m[0];
      }
    }
    const uuidMatch = url.match(UUID_RE);
    if (uuidMatch) return uuidMatch[0];
    const hashMatch = url.match(HASH_RE);
    if (hashMatch) return hashMatch[0];
    const last = segments[segments.length - 1];
    if (last) {
      const cleaned = last.replace(/\.[^./]+$/, "");
      if (cleaned) return cleaned;
    }
    return null;
  } catch {
    const uuidMatch = url.match(UUID_RE);
    if (uuidMatch) return uuidMatch[0];
    const hashMatch = url.match(HASH_RE);
    if (hashMatch) return hashMatch[0];
    return null;
  }
}
