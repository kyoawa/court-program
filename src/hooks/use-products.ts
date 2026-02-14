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
