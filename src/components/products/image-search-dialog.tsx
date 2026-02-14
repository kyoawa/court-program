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
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import { Loader2, AlertCircle, ImageOff, Check } from "lucide-react";
import type { ProductSearchResult } from "@/hooks/use-image-search";

interface ImageSearchDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  results: ProductSearchResult[];
  isSearching: boolean;
  progress: { current: number; total: number };
}

export function ImageSearchDialog({
  open,
  onOpenChange,
  results,
  isSearching,
  progress,
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
      <DialogContent className="sm:max-w-4xl max-h-[90vh] overflow-y-auto">
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
            />
          ))}

          {!isSearching && completedResults.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-4">
              No search results yet.
            </p>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose}>
            Cancel
          </Button>
          <Button onClick={handleApprove} disabled={selectedCount === 0}>
            Queue {selectedCount} Image{selectedCount !== 1 ? "s" : ""} for
            Upload
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ProductResultCard({
  result,
  selectedUrl,
  onSelectImage,
}: {
  result: ProductSearchResult;
  selectedUrl?: string;
  onSelectImage: (url: string) => void;
}) {
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
        <div className="grid grid-cols-4 gap-2">
          {result.images.map((img, i) => (
            <button
              key={i}
              type="button"
              onClick={() => onSelectImage(img.originalUrl)}
              className={cn(
                "relative rounded-md border-2 overflow-hidden aspect-square cursor-pointer transition-all hover:opacity-90",
                selectedUrl === img.originalUrl
                  ? "border-primary ring-2 ring-primary/30"
                  : "border-transparent"
              )}
            >
              <img
                src={img.thumbnailUrl}
                alt={img.title || `Result ${i + 1}`}
                className="w-full h-full object-cover"
                loading="lazy"
                referrerPolicy="no-referrer"
              />
              {selectedUrl === img.originalUrl && (
                <div className="absolute top-1 right-1 bg-primary text-primary-foreground rounded-full p-0.5">
                  <Check className="h-3 w-3" />
                </div>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
