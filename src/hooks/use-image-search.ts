"use client";

import { useState, useCallback, useRef } from "react";
import type { ImageSearchResult, ProductSearchRequest } from "@/lib/types";

export interface ProductSearchResult {
  productId: number;
  productName: string;
  query: string;
  status: "pending" | "searching" | "done" | "error";
  images: ImageSearchResult[];
  error?: string;
}

export function useImageSearch() {
  const [results, setResults] = useState<ProductSearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const abortRef = useRef<AbortController | null>(null);

  const startSearch = useCallback(
    async (products: ProductSearchRequest[]) => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      setIsSearching(true);
      setProgress({ current: 0, total: products.length });

      // Initialize all as pending
      setResults(
        products.map((p) => ({
          productId: p.productId,
          productName: p.productName,
          query: "",
          status: "pending" as const,
          images: [],
        }))
      );

      try {
        const res = await fetch("/api/images/search", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ products }),
          signal: controller.signal,
        });

        if (!res.ok) {
          throw new Error(`Search request failed: ${res.status}`);
        }

        const reader = res.body?.getReader();
        const decoder = new TextDecoder();
        let done = 0;

        if (reader) {
          let buffer = "";
          while (true) {
            const { done: streamDone, value } = await reader.read();
            if (streamDone) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split("\n");
            buffer = lines.pop() ?? "";

            for (const line of lines) {
              if (!line.startsWith("data: ")) continue;
              const data = JSON.parse(line.slice(6));

              if (data.type === "searching") {
                setResults((prev) =>
                  prev.map((r) =>
                    r.productId === data.productId
                      ? { ...r, status: "searching" as const, query: data.query }
                      : r
                  )
                );
              } else if (data.type === "results") {
                done++;
                setProgress({ current: done, total: products.length });
                setResults((prev) =>
                  prev.map((r) =>
                    r.productId === data.productId
                      ? {
                          ...r,
                          status: "done" as const,
                          images: data.images,
                        }
                      : r
                  )
                );
              } else if (data.type === "search_error") {
                done++;
                setProgress({ current: done, total: products.length });
                setResults((prev) =>
                  prev.map((r) =>
                    r.productId === data.productId
                      ? {
                          ...r,
                          status: "error" as const,
                          error: data.error,
                        }
                      : r
                  )
                );
              }
            }
          }
        }
      } catch (err) {
        if ((err as Error).name !== "AbortError") {
          console.error("Image search failed:", err);
        }
      } finally {
        setIsSearching(false);
      }
    },
    []
  );

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

  return { results, isSearching, progress, startSearch, stop, reset };
}
