"use client";

import useSWR from "swr";
import type { ProductCategory } from "@/lib/types";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

export function useCategories() {
  const { data, error, isLoading } = useSWR<ProductCategory[]>(
    "/api/categories",
    fetcher,
    { revalidateOnFocus: false, dedupingInterval: 600000 }
  );

  return {
    categories: data ?? [],
    error,
    isLoading,
  };
}
