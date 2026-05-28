"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ImageOff, Info, Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import type { ProductDetail } from "@/lib/types";

interface ProductImagesDialogProps {
  product: ProductDetail;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImagesChanged?: () => void;
}

export function ProductImagesDialog({
  product,
  open,
  onOpenChange,
  onImagesChanged,
}: ProductImagesDialogProps) {
  const urls = useMemo<string[]>(() => {
    if (product.imageUrls && product.imageUrls.length > 0) return product.imageUrls;
    if (product.imageUrl) return [product.imageUrl];
    return [];
  }, [product.imageUrls, product.imageUrl]);

  const [pendingDeleteUrl, setPendingDeleteUrl] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [managedUrls, setManagedUrls] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    fetch(`/api/images/managed?productId=${product.productId}`)
      .then((res) => (res.ok ? res.json() : { managedUrls: [] }))
      .then((data: { managedUrls?: string[] }) => {
        if (cancelled) return;
        setManagedUrls(new Set(data.managedUrls ?? []));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [open, product.productId, urls]);

  async function handleDelete() {
    if (!pendingDeleteUrl) return;

    setDeleting(true);
    try {
      const res = await fetch("/api/images/remove", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          productId: product.productId,
          imageUrl: pendingDeleteUrl,
        }),
      });
      if (res.status === 422) {
        const data = await res.json().catch(() => ({}));
        toast.error(data.message ?? "This image cannot be deleted via the API.");
        setPendingDeleteUrl(null);
        return;
      }
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `Request failed: ${res.status}`);
      }
      toast.success("Image removed");
      setPendingDeleteUrl(null);
      onImagesChanged?.();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to remove image");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              Images for {product.productName ?? "Unnamed"}
            </DialogTitle>
            <DialogDescription>
              {urls.length === 0
                ? "This product has no images."
                : `${urls.length} image${urls.length === 1 ? "" : "s"} attached to this product.`}
            </DialogDescription>
          </DialogHeader>

          {urls.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-8 text-muted-foreground">
              <ImageOff className="h-8 w-8" />
              <span className="text-sm">No images to show.</span>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 max-h-[60vh] overflow-y-auto">
              {urls.map((url) => {
                const isUnmanaged = !managedUrls.has(url);
                return (
                  <div
                    key={url}
                    className="relative rounded-md border overflow-hidden bg-muted/30"
                  >
                    <img
                      src={url}
                      alt={product.productName ?? ""}
                      className="w-full h-[200px] max-h-[200px] object-contain"
                      loading="lazy"
                    />
                    {isUnmanaged && (
                      <div
                        className="absolute top-1 left-1 h-6 w-6 rounded-full bg-background/90 border flex items-center justify-center shadow-sm"
                        title="Uploaded outside this app — delete via Dutchie Backoffice"
                        aria-label="Uploaded outside this app"
                      >
                        <Info className="h-3.5 w-3.5 text-muted-foreground" />
                      </div>
                    )}
                    <Button
                      variant="destructive"
                      size="sm"
                      className="absolute top-1 right-1 h-7 w-7 p-0"
                      onClick={() => setPendingDeleteUrl(url)}
                      aria-label="Delete image"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                );
              })}
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog
        open={!!pendingDeleteUrl}
        onOpenChange={(o) => !o && !deleting && setPendingDeleteUrl(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete this image?</DialogTitle>
            <DialogDescription>
              This will remove it from Dutchie and update the product&apos;s online menu.
            </DialogDescription>
          </DialogHeader>
          {pendingDeleteUrl && (
            <img
              src={pendingDeleteUrl}
              alt=""
              className="w-full max-h-48 object-contain rounded-md border"
            />
          )}
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setPendingDeleteUrl(null)}
              disabled={deleting}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={deleting}
            >
              {deleting && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
              {deleting ? "Deleting..." : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
