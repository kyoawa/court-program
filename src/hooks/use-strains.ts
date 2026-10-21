"use client";

import useSWR from "swr";
import { useMemo } from "react";
import type { StrainDetail } from "@/lib/types";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

/** Catalog strain names, sorted, for rule dropdowns. */
export function useStrains() {
  const { data, error, isLoading } = useSWR<StrainDetail[]>("/api/strains", fetcher, {
    revalidateOnFocus: false,
    dedupingInterval: 600000,
  });
  const names = useMemo(
    () => Array.from(new Set((Array.isArray(data) ? data : []).map((s) => s.strainName).filter((n): n is string => Boolean(n)))).sort((a, b) => a.localeCompare(b)),
    [data]
  );
  return { strains: names, error, isLoading };
}
