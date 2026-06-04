"use client";

import useSWR from "swr";
import { useMemo } from "react";
import type { ProductDetail } from "@/lib/types";

const fetcher = async (url: string) => {
  const res = await fetch(url);
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || `Request failed: ${res.status}`);
  }
  return res.json();
};

export function useProducts(params?: {
  fromLastModifiedDateUTC?: string;
  isActive?: boolean;
}) {
  const url = useMemo(() => {
    const sp = new URLSearchParams();
    if (params?.fromLastModifiedDateUTC) {
      sp.set("fromLastModifiedDateUTC", params.fromLastModifiedDateUTC);
    }
    if (params?.isActive !== undefined) {
      sp.set("isActive", String(params.isActive));
    }
    const qs = sp.toString();
    return qs ? `/api/products?${qs}` : "/api/products";
  }, [params?.fromLastModifiedDateUTC, params?.isActive]);

  const { data, error, isLoading, mutate } = useSWR<ProductDetail[]>(
    url,
    fetcher,
    {
      revalidateOnFocus: false,
      dedupingInterval: 120000,
      errorRetryCount: 3,
      errorRetryInterval: 5000,
    }
  );

  return {
    products: data ?? [],
    error,
    isLoading,
    mutate,
  };
}

export interface PagedProductsResponse {
  products: ProductDetail[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
}

/**
 * Server-paginated / server-filtered products. Uses the optional query params
 * on /api/products so payloads stay small in paginated mode. The Dutchie call
 * shape is unchanged — these params only post-process the response.
 */
export function useProductsPaged(params: {
  page?: number;
  pageSize?: number;
  all?: boolean;
  multiImageOnly?: boolean;
  isActive?: boolean;
}) {
  const url = useMemo(() => {
    const sp = new URLSearchParams();
    if (params.all) {
      sp.set("all", "true");
    } else {
      sp.set("page", String(params.page ?? 1));
      sp.set("pageSize", String(params.pageSize ?? 50));
    }
    if (params.multiImageOnly) sp.set("multiImageOnly", "true");
    if (params.isActive !== undefined) sp.set("isActive", String(params.isActive));
    return `/api/products?${sp.toString()}`;
  }, [
    params.page,
    params.pageSize,
    params.all,
    params.multiImageOnly,
    params.isActive,
  ]);

  const { data, error, isLoading, mutate } = useSWR<PagedProductsResponse>(
    url,
    fetcher,
    {
      revalidateOnFocus: false,
      dedupingInterval: 120000,
      errorRetryCount: 3,
      errorRetryInterval: 5000,
      keepPreviousData: true,
    }
  );

  return {
    products: data?.products ?? [],
    total: data?.total ?? 0,
    page: data?.page ?? params.page ?? 1,
    pageSize: data?.pageSize ?? params.pageSize ?? 50,
    hasMore: data?.hasMore ?? false,
    error,
    isLoading,
    mutate,
  };
}
