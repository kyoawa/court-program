"use client";

import { useState, useCallback, useRef } from "react";
import type { ImageSearchResult, ImageSearchSource, ProductSearchRequest } from "@/lib/types";

export interface ProductSearchResult {
  productId: number;
  productName: string;
  query: string;
  status: "pending" | "searching" | "done" | "error";
  images: ImageSearchResult[];
  error?: string;
  /** Server-side explanation, e.g. a source that could not be searched. */
  note?: string;
}

type StreamEvent =
  | { type: "searching"; productId: number; query: string }
  | { type: "results"; productId: number; images: ImageSearchResult[]; note?: string }
  | { type: "search_error"; productId: number; error: string }
  | { type: "done" };

export function useImageSearch(initialSource: ImageSearchSource = "brand") {
  const [results, setResults] = useState<ProductSearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [source, setSource] = useState<ImageSearchSource>(initialSource);
  const abortRef = useRef<AbortController | null>(null);
  const lastProductsRef = useRef<ProductSearchRequest[]>([]);
  const sourceRef = useRef<ImageSearchSource>(initialSource);

  const update = useCallback((productId: number, patch: Partial<ProductSearchResult>) => {
    setResults((prev) => prev.map((r) => (r.productId === productId ? { ...r, ...patch } : r)));
  }, []);

  /** Streams one search request and applies its events; resolves when the stream ends. */
  const run = useCallback(
    async (products: ProductSearchRequest[], searchSource: ImageSearchSource, signal?: AbortSignal, onDone?: () => void) => {
      const res = await fetch("/api/images/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ products, source: searchSource }),
        signal,
      });
      if (!res.ok) throw new Error(`Search request failed: ${res.status}`);
      const reader = res.body?.getReader();
      if (!reader) return;
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
          const data = JSON.parse(line.slice(6)) as StreamEvent;
          if (data.type === "searching") {
            update(data.productId, { status: "searching", query: data.query });
          } else if (data.type === "results") {
            onDone?.();
            update(data.productId, { status: "done", images: data.images, note: data.note });
          } else if (data.type === "search_error") {
            onDone?.();
            update(data.productId, { status: "error", error: data.error });
          }
        }
      }
    },
    [update]
  );

  const startSearch = useCallback(
    async (products: ProductSearchRequest[], searchSource: ImageSearchSource = sourceRef.current) => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      lastProductsRef.current = products;
      sourceRef.current = searchSource;
      setSource(searchSource);
      setIsSearching(true);
      setProgress({ current: 0, total: products.length });
      setResults(products.map((p) => ({ productId: p.productId, productName: p.productName, query: "", status: "pending" as const, images: [] })));
      let done = 0;
      try {
        await run(products, searchSource, controller.signal, () => setProgress({ current: ++done, total: products.length }));
      } catch (err) {
        if ((err as Error).name !== "AbortError") console.error("Image search failed:", err);
      } finally {
        if (abortRef.current === controller) setIsSearching(false);
      }
    },
    [run]
  );

  /** Re-runs the last search against a different source. */
  const changeSource = useCallback(
    (next: ImageSearchSource) => {
      if (next === sourceRef.current && results.length) return;
      if (lastProductsRef.current.length) void startSearch(lastProductsRef.current, next);
      else { sourceRef.current = next; setSource(next); }
    },
    [results.length, startSearch]
  );

  const searchSingle = useCallback(
    async (productId: number, customQuery: string) => {
      const previous = lastProductsRef.current.find((p) => p.productId === productId);
      update(productId, { status: "searching", query: customQuery, images: [], error: undefined, note: undefined });
      try {
        await run([{
          productId,
          productName: customQuery,
          brandName: previous?.brandName ?? null,
          category: previous?.category ?? null,
          strain: previous?.strain ?? null,
          customQuery,
        }], sourceRef.current);
      } catch (err) {
        update(productId, { status: "error", error: (err as Error).message });
      }
    },
    [run, update]
  );

  const retryFailed = useCallback(async () => {
    const errored = results.filter((r) => r.status === "error");
    if (errored.length === 0) return;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setIsSearching(true);
    setProgress({ current: 0, total: errored.length });
    setResults((prev) => prev.map((r) => (r.status === "error" ? { ...r, status: "pending" as const, error: undefined, images: [] } : r)));
    const retryProducts: ProductSearchRequest[] = errored.map((r) => {
      const previous = lastProductsRef.current.find((p) => p.productId === r.productId);
      return {
        productId: r.productId,
        productName: r.productName,
        brandName: previous?.brandName ?? null,
        category: previous?.category ?? null,
        strain: previous?.strain ?? null,
        customQuery: r.query || undefined,
      };
    });
    let done = 0;
    try {
      await run(retryProducts, sourceRef.current, controller.signal, () => setProgress({ current: ++done, total: errored.length }));
    } catch (err) {
      if ((err as Error).name !== "AbortError") console.error("Retry failed:", err);
    } finally {
      if (abortRef.current === controller) setIsSearching(false);
    }
  }, [results, run]);

  const stop = useCallback(() => {
    abortRef.current?.abort();
    setIsSearching(false);
  }, []);

  const reset = useCallback(() => {
    abortRef.current?.abort();
    setResults([]);
    setIsSearching(false);
    setProgress({ current: 0, total: 0 });
  }, []);

  return { results, isSearching, progress, source, changeSource, startSearch, searchSingle, retryFailed, stop, reset };
}
