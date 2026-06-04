import { MAX_IMAGE_SIZE_MB, SUPPORTED_IMAGE_TYPES } from "./constants";

/**
 * Canonical image count for a product. Mirrors how the rest of the app counts
 * images (the "+N" thumbnail badge and the Images column): prefer the
 * `imageUrls` array length, fall back to a single `imageUrl`, else 0.
 * A product is "multi-image" when this is >= 2.
 */
export function getImageCount(p: {
  imageUrl: string | null;
  imageUrls: string[] | null;
}): number {
  if (p.imageUrls && p.imageUrls.length > 0) return p.imageUrls.length;
  if (p.imageUrl) return 1;
  return 0;
}

export function validateImageFile(file: File): string | null {
  if (!SUPPORTED_IMAGE_TYPES.includes(file.type)) {
    return `Unsupported file type: ${file.type}. Use JPG, PNG, or WebP.`;
  }
  if (file.size > MAX_IMAGE_SIZE_MB * 1024 * 1024) {
    return `File too large: ${(file.size / 1024 / 1024).toFixed(1)}MB. Max is ${MAX_IMAGE_SIZE_MB}MB.`;
  }
  return null;
}

export function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      // Strip the data URL prefix (e.g., "data:image/png;base64,")
      const base64 = result.split(",")[1];
      resolve(base64);
    };
    reader.onerror = () => reject(new Error("Failed to read file"));
    reader.readAsDataURL(file);
  });
}

export function extractFilenameFromUrl(url: string): string {
  try {
    const pathname = new URL(url).pathname;
    const parts = pathname.split("/");
    return parts[parts.length - 1] || "image.jpg";
  } catch {
    return "image.jpg";
  }
}
