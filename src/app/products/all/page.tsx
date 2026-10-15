"use client";

import { useState, useMemo, useRef } from "react";
import Link from "next/link";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useProductFacets, useProductsPaged } from "@/hooks/use-products";
import { useInventory } from "@/hooks/use-inventory";
import { ProductTable } from "@/components/products/product-table";
import { ProductFilterBar } from "@/components/products/product-filter-bar";
import { EMPTY_FILTERS, hasActiveFilters, type ProductFilters } from "@/lib/product-filters";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { getImageCount } from "@/lib/image-utils";
import type { ProductDetail } from "@/lib/types";
import { ImageOff, ChevronLeft, ChevronRight } from "lucide-react";

const PAGE_SIZE = 50;
const ROW_HEIGHT = 56;

export default function AllProductsPage() {
  const [page, setPage] = useState(1);
  const [showAll, setShowAll] = useState(false);
  const [filters, setFilters] = useState<ProductFilters>(EMPTY_FILTERS);

  // Filters run server-side before pagination, so page counts and totals
  // reflect the filtered catalog rather than one page of it.
  const { products, total, hasMore, isLoading, mutate } = useProductsPaged({
    page,
    pageSize: PAGE_SIZE,
    all: showAll,
    filters,
    isActive: true,
  });
  const { facets } = useProductFacets({ isActive: true });
  const { inventory } = useInventory();

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  function resetPaging() {
    setPage(1);
  }

  function applyFilters(next: ProductFilters) {
    setFilters(next);
    resetPaging();
  }

  const countSummary = isLoading
    ? "Loading..."
    : showAll
      ? `${total} products${hasActiveFilters(filters) ? " match" : ""}`
      : `Showing ${products.length} of ${total} products${hasActiveFilters(filters) ? " matching" : ""}`;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">All Products</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Browse and filter the full product catalog by keyword, brand,
          vendor, category, stock location, images and descriptions.
        </p>
      </div>

      <ProductFilterBar
        filters={filters}
        onChange={applyFilters}
        facets={facets}
        summary={countSummary}
      >
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
      </ProductFilterBar>

      {showAll ? (
        <VirtualProductList products={products} isLoading={isLoading} />
      ) : (
        <>
          <ProductTable
            products={products}
            isLoading={isLoading}
            disablePagination
            inventory={inventory}
            showInventory
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
