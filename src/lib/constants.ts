export const CACHE_TTL = {
  categories: 60 * 60 * 1000, // 1 hour
  products: 30 * 60 * 1000, // 30 minutes
  strains: 60 * 60 * 1000, // 1 hour
  inventory: 30 * 60 * 1000, // 30 minutes
};

export const STORES = {
  BILLINGS: "DUTCHIE_AUTH_BILLINGS",
  BOZEMAN: "DUTCHIE_AUTH_BOZEMAN",
  BUTTE: "DUTCHIE_AUTH_BUTTE",
  FOUR_CORNERS: "DUTCHIE_AUTH_FOUR_CORNERS",
  GREAT_FALLS: "DUTCHIE_AUTH_GREAT_FALLS",
  HELENA: "DUTCHIE_AUTH_HELENA",
  KALISPELL: "DUTCHIE_AUTH_KALISPELL",
  MISSOULA: "DUTCHIE_AUTH_MISSOULA",
  EMIGRANT: "DUTCHIE_AUTH_EMIGRANT",
  BIRDSEYE: "DUTCHIE_AUTH_BIRDSEYE",
  MANUFACTURING: "DUTCHIE_AUTH_MANUFACTURING",
} as const;

export type StoreName = keyof typeof STORES;

export const RETAIL_STORES = Object.keys(STORES).filter(
  (k) => k !== "MANUFACTURING"
) as StoreName[];

export const PRODUCTS_PER_PAGE = 50;

export const UPLOAD_CONCURRENCY = 3;
export const IMAGE_SEARCH_DELAY_MS = 2000;
export const IMAGE_SEARCH_MAX_RESULTS = 8;
export const MAX_IMAGE_SIZE_MB = 10;
export const SUPPORTED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];
