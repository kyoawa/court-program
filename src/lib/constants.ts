export const CACHE_TTL = {
  categories: 60 * 60 * 1000, // 1 hour
  products: 30 * 60 * 1000, // 30 minutes
  strains: 60 * 60 * 1000, // 1 hour
};

export const PRODUCTS_PER_PAGE = 50;

export const UPLOAD_CONCURRENCY = 3;
export const IMAGE_SEARCH_DELAY_MS = 2000;
export const IMAGE_SEARCH_MAX_RESULTS = 8;
export const MAX_IMAGE_SIZE_MB = 10;
export const SUPPORTED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];
