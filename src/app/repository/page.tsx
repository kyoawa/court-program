"use client";

import { useState, useMemo } from "react";
import { useRepository } from "@/hooks/use-repository";
import { useProducts } from "@/hooks/use-products";
import { UploadDialog } from "@/components/repository/upload-dialog";
import { RuleEditor } from "@/components/repository/rule-editor";
import { MatchPreview } from "@/components/repository/match-preview";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Trash2, ChevronDown, ChevronRight, Loader2, ImageOff } from "lucide-react";
import { toast } from "sonner";
import type { RepositoryImage } from "@/lib/types";

export default function RepositoryPage() {
  const { images, isLoading, mutate } = useRepository();
  const { products, isLoading: productsLoading } = useProducts({
    isActive: true,
  });
  const [expandedId, setExpandedId] = useState<number | null>(null);

  const brands = useMemo(() => {
    const set = new Set<string>();
    for (const p of products) {
      if (p.brandName) set.add(p.brandName);
    }
    return Array.from(set).sort();
  }, [products]);

  const categories = useMemo(() => {
    const set = new Set<string>();
    for (const p of products) {
      if (p.category) set.add(p.category);
    }
    return Array.from(set).sort();
  }, [products]);

  // For match preview, only show products missing images
  const missingImageProducts = useMemo(
    () => products.filter((p) => !p.imageUrl && (!p.imageUrls || p.imageUrls.length === 0)),
    [products]
  );

  async function handleDelete(image: RepositoryImage) {
    try {
      const res = await fetch(`/api/repository/images/${image.id}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Failed to delete");
      toast.success(`Deleted "${image.name}"`);
      mutate();
    } catch {
      toast.error("Failed to delete image");
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Image Repository</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Store reusable images and set rules to auto-match products.
          </p>
        </div>
        <UploadDialog onUploaded={() => mutate()} />
      </div>

      {isLoading && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      )}

      {!isLoading && images.length === 0 && (
        <div className="text-center py-12 text-muted-foreground">
          <ImageOff className="h-8 w-8 mx-auto mb-3" />
          <p>No images in the repository yet.</p>
          <p className="text-sm mt-1">Add an image to get started.</p>
        </div>
      )}

      {images.length > 0 && (
        <div className="space-y-3">
          {images.map((image) => {
            const isExpanded = expandedId === image.id;
            return (
              <div
                key={image.id}
                className="rounded-lg border overflow-hidden"
              >
                <div
                  className="flex items-center gap-4 p-3 cursor-pointer hover:bg-accent/50 transition-colors"
                  onClick={() =>
                    setExpandedId(isExpanded ? null : image.id)
                  }
                >
                  <img
                    src={`/api/repository/images/${image.id}`}
                    alt={image.name}
                    className="w-12 h-12 rounded object-cover flex-shrink-0"
                  />
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm truncate">
                      {image.name}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {image.fileName}
                    </p>
                  </div>
                  <Badge variant="secondary" className="text-xs">
                    {image.rules.length} rule(s)
                  </Badge>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 w-8 p-0"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDelete(image);
                    }}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                  {isExpanded ? (
                    <ChevronDown className="h-4 w-4 text-muted-foreground" />
                  ) : (
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  )}
                </div>

                {isExpanded && (
                  <div className="border-t p-4 bg-muted/30">
                    <div className="flex gap-6">
                      <img
                        src={`/api/repository/images/${image.id}`}
                        alt={image.name}
                        className="w-48 h-48 rounded-lg object-contain border bg-background"
                      />
                      <div className="flex-1">
                        <RuleEditor
                          imageId={image.id}
                          rules={image.rules}
                          brands={brands}
                          categories={categories}
                          onChanged={() => mutate()}
                        />
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {images.length > 0 && (
        <>
          <Separator />
          <MatchPreview
            products={missingImageProducts}
            productsLoading={productsLoading}
          />
        </>
      )}
    </div>
  );
}
