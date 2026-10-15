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
  replaceExisting?: boolean;
}

export function useUploadQueue() {
  const [items, setItems] = useState<UploadItem[]>([]);
  const abortRef = useRef(false);
  const runningRef = useRef(false);
  const [isRunning, setIsRunning] = useState(false);

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
    async (replaceExisting = false) => {
      if (runningRef.current) return;
      abortRef.current = false;

      const queued = items.filter((i) => i.status === "queued");
      if (queued.length === 0) return;

      if (replaceExisting && new Set(queued.map(item => item.productId)).size !== queued.length) {
        throw new Error("Replace mode requires exactly one queued image per product. Remove extra images first.");
      }
      runningRef.current = true;
      setIsRunning(true);
      let succeeded = 0;
      let failed = 0;
      try {
        const replacements = queued.filter(item => item.replaceExisting ?? replaceExisting);
        if (replacements.length) {
          const response = await fetch("/api/images/replace/plan", {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ items: replacements.map(item => ({ operationId: item.id, productId: item.productId })) }),
          });
          if (!response.ok) {
            const data = await response.json().catch(() => ({}));
            throw new Error(data.error || "Unable to prepare replacements");
          }
        }
        const queuedIds = new Set(queued.map(item => item.id));
        setItems(previous => previous.map(item => queuedIds.has(item.id)
          ? { ...item, replaceExisting: item.replaceExisting ?? replaceExisting } : item));
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
              const replacing = item.replaceExisting ?? replaceExisting;
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
              } else if (replacing) {
                base64 = "";
                fileName = "image.jpg";
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

                if (!res.ok) {
                  if (res.status === 429) abortRef.current = true;
                  const data = await res.json().catch(() => ({}));
                  throw new Error(res.status === 429 ? "Dutchie rate limit reached. Batch paused; wait before retrying." : data.error || `Upload failed: ${res.status}`);
                }
                const reader = res.body?.getReader();
                const decoder = new TextDecoder();
                let resultUrl: string | undefined;
                let error: string | undefined;
                let receivedSuccess = false;
                let pending = "";

                if (reader) {
                  while (true) {
                    const { done, value } = await reader.read();
                    if (done) break;
                    pending += decoder.decode(value, { stream: true });
                    const parts = pending.split("\n");
                    pending = parts.pop() ?? "";
                    const lines = parts.filter((line) => line.startsWith("data: "));
                    for (const line of lines) {
                      const data = JSON.parse(line.slice(6));
                      if (data.type === "success") {
                        resultUrl = data.result?.imageUrl;
                        receivedSuccess = Boolean(data.result?.imageId && resultUrl);
                      } else if (data.type === "error") {
                        error = data.error;
                      }
                    }
                  }
                }

                if (error) throw new Error(error);
                if (!receivedSuccess) throw new Error("Upload was not confirmed. Check the product before retrying.");
                succeeded++;

                setItems((prev) =>
                  prev.map((i) =>
                    i.id === item.id
                      ? { ...i, status: "success" as const, resultImageUrl: resultUrl }
                      : i
                  )
                );
                continue;
              }

              const res = await fetch(replacing ? "/api/images/replace" : "/api/images/set", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  productId: item.productId,
                  operationId: replacing ? item.id : undefined,
                  imageUrl: replacing && item.source.type === "url" ? item.source.url : undefined,
                  base64Image: base64 || undefined,
                  fileName,
                }),
              });

              if (!res.ok) {
                if (res.status === 429) abortRef.current = true;
                const data = await res.json().catch(() => ({}));
                throw new Error(res.status === 429 ? "Dutchie rate limit reached. Batch paused; wait before retrying." : data.error || `Upload failed: ${res.status}`);
              }

              const result = await res.json();
              if (!result.imageId || !result.imageUrl) throw new Error("Dutchie did not confirm the uploaded image.");
              succeeded++;

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
              failed++;
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
        return { succeeded, failed, paused: abortRef.current };
      } finally {
        runningRef.current = false;
        setIsRunning(false);
      }
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
    isRunning,
    addItems,
    removeItem,
    clearCompleted,
    startUpload,
    retryFailed,
    stopUpload,
    stats,
  };
}
