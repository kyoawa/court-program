"use client";

import useSWR from "swr";
import type { RepositoryImage } from "@/lib/types";

const fetcher = async (url: string) => {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || `Request failed: ${res.status}`);
  }
  return res.json();
};

export function useRepository() {
  const { data, error, isLoading, mutate } = useSWR<RepositoryImage[]>(
    "/api/repository/images",
    fetcher,
    {
      revalidateOnFocus: false,
      dedupingInterval: 5000,
    }
  );

  return {
    images: data ?? [],
    error,
    isLoading,
    mutate,
  };
}
