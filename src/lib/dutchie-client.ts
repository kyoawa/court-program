import type {
  ProductDetail,
  ProductCategory,
  StrainDetail,
  SetImageRequest,
  SetImageResponse,
  DeleteImageRequest,
  SuccessResult,
} from "./types";
import { STORES, type StoreName } from "./constants";

function getAuthHeader(store?: StoreName): string {
  const envKey = store ? STORES[store] : "DUTCHIE_AUTH_BILLINGS";
  const value = process.env[envKey];
  if (!value) throw new Error(`Missing env var: ${envKey}`);
  return value;
}

function getBaseUrl(): string {
  const url = process.env.DUTCHIE_BASE_URL;
  if (!url) throw new Error("Missing env var: DUTCHIE_BASE_URL");
  return url;
}

async function apiRequest<T>(
  path: string,
  options: {
    method?: string;
    body?: unknown;
    params?: Record<string, string>;
    store?: StoreName;
  } = {}
): Promise<T> {
  const baseUrl = getBaseUrl();
  const url = new URL(path, baseUrl);

  if (options.params) {
    for (const [k, v] of Object.entries(options.params)) {
      url.searchParams.set(k, v);
    }
  }

  const res = await fetch(url.toString(), {
    method: options.method ?? "GET",
    headers: {
      Authorization: getAuthHeader(options.store),
      "Content-Type": "application/json",
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Dutchie API ${res.status}: ${text || res.statusText}`);
  }

  return res.json() as Promise<T>;
}

export async function getProducts(params?: {
  fromLastModifiedDateUTC?: string;
  isActive?: boolean;
  store?: StoreName;
}): Promise<ProductDetail[]> {
  const queryParams: Record<string, string> = {};
  if (params?.fromLastModifiedDateUTC) {
    queryParams.fromLastModifiedDateUTC = params.fromLastModifiedDateUTC;
  }
  if (params?.isActive !== undefined) {
    queryParams.isActive = String(params.isActive);
  }
  return apiRequest<ProductDetail[]>("/products", {
    params: queryParams,
    store: params?.store,
  });
}

export async function getCategories(): Promise<ProductCategory[]> {
  return apiRequest<ProductCategory[]>("/product-category");
}

export async function getStrains(): Promise<StrainDetail[]> {
  return apiRequest<StrainDetail[]>("/products/strains");
}

export async function setImage(req: SetImageRequest): Promise<SetImageResponse> {
  return apiRequest<SetImageResponse>("/products/set-image", {
    method: "POST",
    body: req,
  });
}

export async function removeImage(req: DeleteImageRequest): Promise<SuccessResult> {
  return apiRequest<SuccessResult>("/products/remove-image", {
    method: "POST",
    body: req,
  });
}

/**
 * SAFETY: This function ONLY updates the onlineDescription field.
 * It GETs the full product first and echoes back ALL fields unchanged
 * to prevent Dutchie from wiping compliance-critical data (THC/CBD,
 * regulatory category, labels, etc.) which get nulled if omitted.
 *
 * DO NOT add any other field modifications here. Ever.
 */
export async function updateOnlineDescription(
  productId: number,
  onlineDescription: string
): Promise<ProductDetail> {
  const products = await getProducts({ isActive: true });
  const p = products.find((prod) => prod.productId === productId);
  if (!p) throw new Error(`Product ${productId} not found`);

  return apiRequest<ProductDetail>("/products/product", {
    method: "POST",
    body: {
      // Identity — required for update
      productId: p.productId,
      sku: p.sku,
      productName: p.productName,

      // THE ONLY FIELD WE ARE CHANGING
      onlineDescription,
    },
  });
}
