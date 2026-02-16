"use client";

import useSWR from "swr";
import type { InventoryMap } from "@/lib/types";

const fetcher = async (url: string) => {
  const res = await fetch(url);
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || `Request failed: ${res.status}`);
  }
  return res.json();
};

export function useInventory() {
  const { data, error, isLoading, mutate } = useSWR<InventoryMap>(
    "/api/inventory",
    fetcher,
    {
      revalidateOnFocus: false,
      dedupingInterval: 300000,
      errorRetryCount: 2,
      errorRetryInterval: 10000,
    }
  );

  return {
    inventory: data ?? {},
    error,
    isLoading,
    mutate,
  };
}
