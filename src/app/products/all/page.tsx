"use client";

import { useState, useMemo, useRef } from "react";
import Link from "next/link";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useProductsPaged } from "@/hooks/use-products";
import { ProductTable } from "@/components/products/product-table";
import { CategoryFilter } from "@/components/products/category-filter";
import { BrandFilter } from "@/components/products/brand-filter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { getImageCount } from "@/lib/image-utils";
import type { ProductDetail } from "@/lib/types";
import { ImageOff, ChevronLeft, ChevronRight } from "lucide-react";

const PAGE_SIZE = 50;
const ROW_HEIGHT = 56;

export default function AllProductsPage() {
  const [page, setPage] = useState(1);
  const [showAll, setShowAll] = useState(false);
  const [multiImageOnly, setMultiImageOnly] = useState(false);
  const [category, setCategory] = useState("all");
  const [brand, setBrand] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");

  const { products, total, hasMore, isLoading, mutate } = useProductsPaged({
    page,
    pageSize: PAGE_SIZE,
    all: showAll,
    multiImageOnly,
    isActive: true,
  });

  // Client-side narrowing (category / brand / search) on top of the
  // server-filtered set — mirrors the Recent / Missing Images pages. These are
  // display-only refinements; the multi-image filter & pagination run server-side.
  const filtered = useMemo(() => {
    let result = products;
    if (category !== "all") {
      result = result.filter((p) => p.category === category);
    }
    if (brand !== "all") {
      result = result.filter((p) => p.brandName === brand);
    }
    if (searchQuery.trim()) {
      const keywords = searchQuery.toLowerCase().split(/\s+/).filter(Boolean);
      result = result.filter((p) => {
        const name = (p.productName ?? "").toLowerCase();
        return keywords.every((kw) => name.includes(kw));
      });
    }
    return result;
  }, [products, category, brand, searchQuery]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  function resetPaging() {
    setPage(1);
  }

  const countSummary = isLoading
    ? "Loading..."
    : multiImageOnly
      ? `Showing ${filtered.length} of ${total} (multi-image only)`
      : `Showing ${filtered.length} of ${total} products`;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">All Products</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Browse the full product catalog. Toggle pagination or filter to
          products that already have multiple images.
        </p>
      </div>

      <div className="flex items-center gap-4 flex-wrap">
        <Input
          placeholder="Search by name..."
          className="w-48 h-9"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
        <CategoryFilter value={category} onChange={setCategory} />
        <BrandFilter value={brand} onChange={setBrand} products={products} />

        <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
          <Checkbox
            checked={multiImageOnly}
            onCheckedChange={(c) => {
              setMultiImageOnly(c === true);
              resetPaging();
            }}
          />
          Only multi-image products
        </label>

        <div className="flex items-center gap-1">
          <Button
            variant={!showAll ? "default" : "outline"}
            size="sm"
            className="text-xs h-9"
            onClick={() => {
              setShowAll(false);
              resetPaging();
            }}
          >
            Paginated
          </Button>
          <Button
            variant={showAll ? "default" : "outline"}
            size="sm"
            className="text-xs h-9"
            onClick={() => {
              setShowAll(true);
              resetPaging();
            }}
          >
            Show all
          </Button>
        </div>

        <span className="text-sm text-muted-foreground ml-auto">
          {countSummary}
        </span>
      </div>

      {showAll ? (
        <VirtualProductList products={filtered} isLoading={isLoading} />
      ) : (
        <>
          <ProductTable
            products={filtered}
            isLoading={isLoading}
            disablePagination
            onProductsChanged={() => mutate()}
          />
          {totalPages > 1 && (
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">
                Page {page} of {totalPages}
              </span>
              <div className="flex items-center gap-1">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <span className="text-sm px-2">
                  {page} / {totalPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={!hasMore}
                  onClick={() => setPage((p) => p + 1)}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

/**
 * Virtualized list for "Show all" mode — renders only the visible window of
 * rows so the page stays responsive with 10,000+ products. Columns mirror the
 * key fields shown in ProductTable (thumbnail, name, category, brand, image
 * count) for visual consistency.
 */
function VirtualProductList({
  products,
  isLoading,
}: {
  products: ProductDetail[];
  isLoading?: boolean;
}) {
  const parentRef = useRef<HTMLDivElement>(null);

  const virtualizer = useVirtualizer({
    count: products.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 12,
  });

  if (isLoading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 8 }).map((_, i) => (
          <Skeleton key={i} className="h-12 w-full" />
        ))}
      </div>
    );
  }

  if (products.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        No products found.
      </div>
    );
  }

  return (
    <div className="rounded-md border">
      {/* Header row */}
      <div className="flex items-center gap-4 border-b bg-muted/40 px-4 py-2 text-sm font-medium text-muted-foreground">
        <span className="w-10 shrink-0">Image</span>
        <span className="flex-1 min-w-0">Product</span>
        <span className="w-40 shrink-0">Category</span>
        <span className="w-40 shrink-0">Brand</span>
        <span className="w-24 shrink-0 text-center">Images</span>
      </div>
      <div ref={parentRef} className="h-[70vh] overflow-auto">
        <div
          style={{ height: `${virtualizer.getTotalSize()}px`, position: "relative" }}
        >
          {virtualizer.getVirtualItems().map((vItem) => {
            const product = products[vItem.index];
            const imgCount = getImageCount(product);
            const primary =
              product.imageUrl ??
              (product.imageUrls && product.imageUrls[0]) ??
              null;
            return (
              <div
                key={product.productId}
                className="flex items-center gap-4 border-b px-4 hover:bg-muted/30"
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  width: "100%",
                  height: `${vItem.size}px`,
                  transform: `translateY(${vItem.start}px)`,
                }}
              >
                <div className="w-10 shrink-0">
                  {primary ? (
                    <img
                      src={primary}
                      alt={product.productName ?? ""}
                      className="w-10 h-10 rounded object-cover"
                      loading="lazy"
                    />
                  ) : (
                    <div className="w-10 h-10 rounded bg-muted flex items-center justify-center">
                      <ImageOff className="h-4 w-4 text-muted-foreground" />
                    </div>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <Link
                    href={`/products/${product.productId}`}
                    className="font-medium text-dutchie-blue hover:underline truncate block"
                  >
                    {product.productName ?? "Unnamed"}
                  </Link>
                </div>
                <span className="w-40 shrink-0 truncate text-sm">
                  {product.category ?? "-"}
                </span>
                <span className="w-40 shrink-0 truncate text-sm">
                  {product.brandName ?? "-"}
                </span>
                <span className="w-24 shrink-0 text-center">
                  {imgCount === 0 ? (
                    <Badge variant="destructive" className="text-xs">
                      None
                    </Badge>
                  ) : (
                    <span className="text-sm">
                      {imgCount} {imgCount === 1 ? "image" : "images"}
                    </span>
                  )}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
