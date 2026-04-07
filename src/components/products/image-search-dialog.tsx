"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { Loader2, AlertCircle, ImageOff, Check, Search, RotateCcw, FolderPlus } from "lucide-react";
import { toast } from "sonner";
import type { ProductSearchResult } from "@/hooks/use-image-search";

interface ImageSearchDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  results: ProductSearchResult[];
  isSearching: boolean;
  progress: { current: number; total: number };
  onSearchSingle?: (productId: number, customQuery: string) => void;
  onRetryFailed?: () => void;
}

export function ImageSearchDialog({
  open,
  onOpenChange,
  results,
  isSearching,
  progress,
  onSearchSingle,
  onRetryFailed,
}: ImageSearchDialogProps) {
  const router = useRouter();
  // productId -> selected image URL
  const [selections, setSelections] = useState<Record<number, string>>({});

  const selectedCount = Object.keys(selections).length;

  const progressPct =
    progress.total > 0 ? (progress.current / progress.total) * 100 : 0;

  const completedResults = useMemo(
    () => results.filter((r) => r.status === "done" || r.status === "error"),
    [results]
  );

  const hasErrors = useMemo(
    () => results.some((r) => r.status === "error"),
    [results]
  );

  function handleSelectImage(productId: number, url: string) {
    setSelections((prev) => {
      if (prev[productId] === url) {
        const next = { ...prev };
        delete next[productId];
        return next;
      }
      return { ...prev, [productId]: url };
    });
  }

  function handleApprove() {
    const items = Object.entries(selections).map(([pid, imageUrl]) => {
      const result = results.find((r) => r.productId === Number(pid));
      return {
        productId: Number(pid),
        productName: result?.productName ?? "Unknown",
        imageUrl,
      };
    });

    sessionStorage.setItem("webSearchItems", JSON.stringify(items));
    onOpenChange(false);
    setSelections({});
    router.push("/upload?fromWebSearch=1");
  }

  function handleClose() {
    onOpenChange(false);
    setSelections({});
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-4xl max-w-[calc(100%-1rem)] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Web Image Search Results</DialogTitle>
          <DialogDescription>
            Select one image per product to queue for upload. Click an image to
            select it, click again to deselect.
          </DialogDescription>
        </DialogHeader>

        {isSearching && (
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm text-muted-foreground">
              <span className="flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                Searching...
              </span>
              <span>
                {progress.current} / {progress.total}
              </span>
            </div>
            <Progress value={progressPct} className="h-2" />
          </div>
        )}

        <div className="space-y-4 mt-2">
          {results.map((result) => (
            <ProductResultCard
              key={result.productId}
              result={result}
              selectedUrl={selections[result.productId]}
              onSelectImage={(url) =>
                handleSelectImage(result.productId, url)
              }
              onSearchCustom={
                onSearchSingle
                  ? (query) => onSearchSingle(result.productId, query)
                  : undefined
              }
            />
          ))}

          {!isSearching && completedResults.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-4">
              No search results yet.
            </p>
          )}
        </div>

        <DialogFooter>
          <div className="flex items-center gap-2 w-full justify-between flex-wrap">
            <div>
              {!isSearching && hasErrors && onRetryFailed && (
                <Button variant="outline" size="sm" onClick={onRetryFailed}>
                  <RotateCcw className="h-3 w-3 mr-1" />
                  Retry Failed
                </Button>
              )}
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" onClick={handleClose}>
                Cancel
              </Button>
              <Button onClick={handleApprove} disabled={selectedCount === 0}>
                Queue {selectedCount} Image{selectedCount !== 1 ? "s" : ""} for
                Upload
              </Button>
            </div>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ProductResultCard({
  result,
  selectedUrl,
  onSelectImage,
  onSearchCustom,
}: {
  result: ProductSearchResult;
  selectedUrl?: string;
  onSelectImage: (url: string) => void;
  onSearchCustom?: (query: string) => void;
}) {
  const [customQuery, setCustomQuery] = useState("");
  const [showCustom, setShowCustom] = useState(false);
  const [loadedImages, setLoadedImages] = useState<Set<string>>(new Set());
  const [savingUrl, setSavingUrl] = useState<string | null>(null);

  function handleImageLoad(url: string) {
    setLoadedImages((prev) => new Set(prev).add(url));
  }

  function handleCustomSearch() {
    if (!customQuery.trim() || !onSearchCustom) return;
    onSearchCustom(customQuery.trim());
    setShowCustom(false);
  }

  async function handleSaveToRepo(imageUrl: string) {
    setSavingUrl(imageUrl);
    try {
      // Proxy-fetch the image
      const proxyRes = await fetch("/api/images/proxy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: imageUrl }),
      });
      if (!proxyRes.ok) throw new Error("Failed to fetch image");
      const { base64, mimeType } = await proxyRes.json();

      const ext = mimeType === "image/png" ? ".png" : mimeType === "image/webp" ? ".webp" : ".jpg";
      const fileName = `${(result.productName || "image").replace(/[^a-zA-Z0-9]/g, "_").slice(0, 50)}${ext}`;

      // Save to repository
      const saveRes = await fetch("/api/repository/images", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: result.productName || "Search Result",
          base64Image: base64,
          fileName,
          mimeType,
          groupName: null,
        }),
      });
      if (!saveRes.ok) throw new Error("Failed to save image");

      toast.success("Image saved to repository");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save to repository");
    } finally {
      setSavingUrl(null);
    }
  }

  return (
    <div className="rounded-lg border p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-medium text-sm">{result.productName}</h3>
          {result.query && (
            <p className="text-xs text-muted-foreground mt-0.5">
              Search: &ldquo;{result.query}&rdquo;
            </p>
          )}
        </div>
        {result.status === "searching" && (
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        )}
        {result.status === "done" && result.images.length > 0 && selectedUrl && (
          <span className="flex items-center gap-1 text-xs text-green-600">
            <Check className="h-3 w-3" /> Selected
          </span>
        )}
      </div>

      {result.status === "pending" && (
        <p className="text-xs text-muted-foreground">Waiting...</p>
      )}

      {result.status === "searching" && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="h-3 w-3 animate-spin" />
          Searching Google Images...
        </div>
      )}

      {result.status === "error" && (
        <div className="flex items-center gap-2 text-xs text-destructive">
          <AlertCircle className="h-3 w-3" />
          {result.error}
        </div>
      )}

      {result.status === "done" && result.images.length === 0 && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <ImageOff className="h-3 w-3" />
          No images found.
        </div>
      )}

      {result.images.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
          {result.images.map((img, i) => (
            <div key={i} className="relative group">
              <button
                type="button"
                onClick={() => onSelectImage(img.originalUrl)}
                className={cn(
                  "relative rounded-md border-2 overflow-hidden aspect-square cursor-pointer transition-all hover:opacity-90 w-full",
                  selectedUrl === img.originalUrl
                    ? "border-primary ring-2 ring-primary/30"
                    : "border-transparent"
                )}
              >
                {!loadedImages.has(img.thumbnailUrl) && (
                  <Skeleton className="absolute inset-0 rounded-md" />
                )}
                <img
                  src={img.thumbnailUrl}
                  alt={img.title || `Result ${i + 1}`}
                  className={cn(
                    "w-full h-full object-cover transition-opacity",
                    loadedImages.has(img.thumbnailUrl) ? "opacity-100" : "opacity-0"
                  )}
                  loading="lazy"
                  referrerPolicy="no-referrer"
                  onLoad={() => handleImageLoad(img.thumbnailUrl)}
                />
                {selectedUrl === img.originalUrl && (
                  <div className="absolute top-1 right-1 bg-primary text-primary-foreground rounded-full p-0.5">
                    <Check className="h-3 w-3" />
                  </div>
                )}
              </button>
              <button
                type="button"
                onClick={() => handleSaveToRepo(img.originalUrl)}
                disabled={savingUrl === img.originalUrl}
                className="absolute bottom-1 left-1 bg-background/80 hover:bg-background text-foreground rounded p-1 opacity-0 group-hover:opacity-100 transition-opacity"
                title="Save to Repository"
              >
                {savingUrl === img.originalUrl ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <FolderPlus className="h-3 w-3" />
                )}
              </button>
            </div>
          ))}
        </div>
      )}

      {onSearchCustom && (result.status === "done" || result.status === "error") && (
        <div className="pt-1">
          {!showCustom ? (
            <button
              type="button"
              onClick={() => setShowCustom(true)}
              className="text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              Not finding it? Search your own terms
            </button>
          ) : (
            <div className="flex items-center gap-2">
              <Input
                placeholder="Type your own search..."
                value={customQuery}
                onChange={(e) => setCustomQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleCustomSearch();
                }}
                className="h-8 text-sm"
                autoFocus
              />
              <Button
                size="sm"
                className="h-8 px-3"
                onClick={handleCustomSearch}
                disabled={!customQuery.trim()}
              >
                <Search className="h-3 w-3 mr-1" />
                Search
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="h-8 px-2"
                onClick={() => setShowCustom(false)}
              >
                Cancel
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
