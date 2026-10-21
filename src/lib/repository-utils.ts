import type { RepositoryImage } from "./types";

/** Image URL versioned by its last update, so a replaced image is not served from cache. */
export function repositoryImageUrl(image: Pick<RepositoryImage, "id" | "updatedAt" | "createdAt"> | { id: number; updatedAt?: string | null; createdAt?: string | null }): string {
  const stamp = Date.parse(image.updatedAt ?? image.createdAt ?? "") || 0;
  return `/api/repository/images/${image.id}?v=${stamp}`;
}
