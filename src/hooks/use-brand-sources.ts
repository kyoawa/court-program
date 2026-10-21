"use client";

import useSWR from "swr";
import { useCallback, useRef, useState } from "react";
import type { BrandSourceRow } from "@/app/api/brand-sources/route";
import type { ScanCandidate } from "@/app/api/brand-sources/[id]/scan/route";

const fetcher = async (url: string) => {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || `Request failed: ${res.status}`);
  }
  return res.json();
};

export function useBrandSources() {
  const { data, error, isLoading, mutate } = useSWR<BrandSourceRow[]>("/api/brand-sources", fetcher, { revalidateOnFocus: false });
  return { sources: data ?? [], error, isLoading, mutate };
}

export interface ScanState {
  status: "idle" | "scanning" | "done" | "error";
  pagesVisited: number;
  queued: number;
  found: number;
  candidates: ScanCandidate[];
  truncated?: boolean;
  truncatedReason?: "pages" | "time";
  errors: { url: string; error: string }[];
  error?: string;
  /** The site showed an age confirmation instead of products. */
  ageGated?: boolean;
}

const IDLE: ScanState = { status: "idle", pagesVisited: 0, queued: 0, found: 0, candidates: [], errors: [] };

/** Runs one source's scan and exposes its streamed progress and results. */
export function useBrandSourceScan() {
  const [state, setState] = useState<ScanState>(IDLE);
  const abortRef = useRef<AbortController | null>(null);

  const scan = useCallback(async (sourceId: number) => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setState({ ...IDLE, status: "scanning" });
    try {
      const res = await fetch(`/api/brand-sources/${sourceId}/scan`, { method: "POST", signal: controller.signal });
      if (!res.ok || !res.body) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `Scan failed: ${res.status}`);
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const event = JSON.parse(line.slice(6));
          if (event.type === "progress") {
            setState((prev) => ({ ...prev, pagesVisited: event.pagesVisited, queued: event.queued, found: event.candidates }));
          } else if (event.type === "done") {
            setState({
              status: "done",
              pagesVisited: event.pagesVisited,
              queued: 0,
              found: event.candidates.length,
              candidates: event.candidates,
              truncated: event.truncated,
              truncatedReason: event.truncatedReason,
              errors: event.errors ?? [],
              ageGated: Boolean(event.ageGated),
            });
          } else if (event.type === "error") {
            throw new Error(event.error);
          }
        }
      }
    } catch (err) {
      if ((err as Error).name === "AbortError") return;
      setState((prev) => ({ ...prev, status: "error", error: err instanceof Error ? err.message : "Scan failed" }));
    }
  }, []);

  const markImported = useCallback((imageUrls: string[]) => {
    const set = new Set(imageUrls);
    setState((prev) => ({ ...prev, candidates: prev.candidates.map((c) => (set.has(c.imageUrl) ? { ...c, imported: true } : c)) }));
  }, []);

  const reset = useCallback(() => {
    abortRef.current?.abort();
    setState(IDLE);
  }, []);

  return { state, scan, markImported, reset };
}
