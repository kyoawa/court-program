"use client";

import { useState, useCallback, useRef } from "react";
import { UPLOAD_CONCURRENCY } from "@/lib/constants";

export type UploadItemStatus = "queued" | "uploading" | "success" | "failed";

export interface UploadItem {
  id: string;
  productId: number;
  productName: string;
  source:
    | { type: "file"; file: File; preview?: string }
    | { type: "url"; url: string };
  status: UploadItemStatus;
  error?: string;
  resultImageUrl?: string;
}

export function useUploadQueue() {
  const [items, setItems] = useState<UploadItem[]>([]);
  const abortRef = useRef(false);

  const addItems = useCallback(
    (newItems: Omit<UploadItem, "id" | "status">[]) => {
      const withIds = newItems.map((item) => ({
        ...item,
        id: crypto.randomUUID(),
        status: "queued" as const,
      }));
      setItems((prev) => [...prev, ...withIds]);
    },
    []
  );

  const removeItem = useCallback((id: string) => {
    setItems((prev) => prev.filter((item) => item.id !== id));
  }, []);

  const clearCompleted = useCallback(() => {
    setItems((prev) => prev.filter((item) => item.status !== "success"));
  }, []);

  const startUpload = useCallback(
    async () => {
      abortRef.current = false;

      const queued = items.filter((i) => i.status === "queued");
      if (queued.length === 0) return;

      let index = 0;

      async function processNext() {
        while (index < queued.length && !abortRef.current) {
          const current = index++;
          const item = queued[current];

          setItems((prev) =>
            prev.map((i) =>
              i.id === item.id ? { ...i, status: "uploading" as const } : i
            )
          );

          try {
            let base64: string;
            let fileName: string;

            if (item.source.type === "file") {
              base64 = await new Promise<string>((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = () => {
                  const result = reader.result as string;
                  resolve(result.split(",")[1]);
                };
                reader.onerror = () => reject(new Error("Failed to read file"));
                reader.readAsDataURL(item.source.type === "file" ? item.source.file : new Blob());
              });
              fileName = item.source.file.name;
            } else {
              const res = await fetch("/api/images/upload-batch", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  items: [
                    {
                      productId: item.productId,
                      imageUrl: item.source.url,
                      productName: item.productName,
                    },
                  ],
                }),
              });

              const reader = res.body?.getReader();
              const decoder = new TextDecoder();
              let resultUrl: string | undefined;
              let error: string | undefined;

              if (reader) {
                while (true) {
                  const { done, value } = await reader.read();
                  if (done) break;
                  const text = decoder.decode(value);
                  const lines = text.split("\n").filter((l) => l.startsWith("data: "));
                  for (const line of lines) {
                    const data = JSON.parse(line.slice(6));
                    if (data.type === "success") {
                      resultUrl = data.result?.imageUrl;
                    } else if (data.type === "error") {
                      error = data.error;
                    }
                  }
                }
              }

              if (error) throw new Error(error);

              setItems((prev) =>
                prev.map((i) =>
                  i.id === item.id
                    ? { ...i, status: "success" as const, resultImageUrl: resultUrl }
                    : i
                )
              );
              continue;
            }

            const res = await fetch("/api/images/set", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                productId: item.productId,
                base64Image: base64,
                fileName,
              }),
            });

            if (!res.ok) {
              const data = await res.json().catch(() => ({}));
              throw new Error(data.error || `Upload failed: ${res.status}`);
            }

            const result = await res.json();

            setItems((prev) =>
              prev.map((i) =>
                i.id === item.id
                  ? {
                      ...i,
                      status: "success" as const,
                      resultImageUrl: result.imageUrl,
                    }
                  : i
              )
            );
          } catch (err) {
            setItems((prev) =>
              prev.map((i) =>
                i.id === item.id
                  ? {
                      ...i,
                      status: "failed" as const,
                      error: err instanceof Error ? err.message : "Unknown error",
                    }
                  : i
              )
            );
          }
        }
      }

      const workers = Array.from(
        { length: Math.min(UPLOAD_CONCURRENCY, queued.length) },
        () => processNext()
      );
      await Promise.all(workers);
    },
    [items]
  );

  const retryFailed = useCallback(() => {
    setItems((prev) =>
      prev.map((item) =>
        item.status === "failed"
          ? { ...item, status: "queued" as const, error: undefined }
          : item
      )
    );
  }, []);

  const stopUpload = useCallback(() => {
    abortRef.current = true;
  }, []);

  const stats = {
    total: items.length,
    queued: items.filter((i) => i.status === "queued").length,
    uploading: items.filter((i) => i.status === "uploading").length,
    success: items.filter((i) => i.status === "success").length,
    failed: items.filter((i) => i.status === "failed").length,
  };

  return {
    items,
    addItems,
    removeItem,
    clearCompleted,
    startUpload,
    retryFailed,
    stopUpload,
    stats,
  };
}
