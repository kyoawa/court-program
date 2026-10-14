export type CatalogSnapshot = {
  productId: number;
  capturedAt: string;
  images: { imageId: number; imageUrl: string }[];
};
export function validateSnapshot(input: unknown): CatalogSnapshot {
  const s = input as Partial<CatalogSnapshot> | null;
  if (!s || !Number.isSafeInteger(s.productId) || s.productId! <= 0 ||
      typeof s.capturedAt !== "string" || !Number.isFinite(Date.parse(s.capturedAt)) ||
      Date.parse(s.capturedAt) > Date.now() + 60_000 ||
      Date.parse(s.capturedAt) < Date.now() - 24 * 60 * 60_000 ||
      !Array.isArray(s.images) || s.images.length > 100) {
    throw new Error("Invalid or expired catalog snapshot. Refresh the Dutchie product and sync again.");
  }
  const ids = new Set<number>();
  const images = s.images.map((image) => {
    if (!image || !Number.isSafeInteger(image.imageId) || image.imageId <= 0 ||
        ids.has(image.imageId) || typeof image.imageUrl !== "string" || image.imageUrl.length > 2048) {
      throw new Error("Invalid or duplicate image ID.");
    }
    const url = new URL(image.imageUrl);
    if (url.protocol !== "https:" || url.username || url.password ||
        url.hostname !== "leaflogixmedia.blob.core.windows.net" || !url.pathname.startsWith("/product-image/")) {
      throw new Error("Unexpected Dutchie image URL; snapshot was not imported.");
    }
    ids.add(image.imageId);
    return { imageId: image.imageId, imageUrl: image.imageUrl };
  });
  return { productId: s.productId!, capturedAt: s.capturedAt, images };
}
