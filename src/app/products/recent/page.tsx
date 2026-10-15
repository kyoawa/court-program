"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useProducts } from "@/hooks/use-products";
import { useInventory } from "@/hooks/use-inventory";
import { useImageSearch } from "@/hooks/use-image-search";
import { ProductTable } from "@/components/products/product-table";
import { ProductFilterBar } from "@/components/products/product-filter-bar";
import { EMPTY_FILTERS, filterProducts } from "@/lib/product-filters";
import { StatusFilter, type ProductStatus } from "@/components/products/status-filter";
import {
  DateRangePicker,
  getDaysAgoISO,
} from "@/components/products/date-range-picker";
import { ImageSearchDialog } from "@/components/products/image-search-dialog";
import { Button } from "@/components/ui/button";
import { Upload, Search } from "lucide-react";

export default function RecentProductsPage() {
  const router = useRouter();
  const [days, setDays] = useState(7);
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [status, setStatus] = useState<ProductStatus>("all");
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [searchDialogOpen, setSearchDialogOpen] = useState(false);

  const fromDate = useMemo(() => getDaysAgoISO(days), [days]);
  const { products, isLoading, mutate } = useProducts({
    fromLastModifiedDateUTC: fromDate,
    isActive: true,
  });

  const { inventory } = useInventory();
  const imageSearch = useImageSearch();

  const cutoffDate = useMemo(() => {
    if (days === 0) return null;
    const d = new Date();
    d.setDate(d.getDate() - days);
    return d;
  }, [days]);

  const filtered = useMemo(() => {
    let result = products;
    if (status !== "all" && cutoffDate) {
      result = result.filter((p) => {
        const isNew = p.createdDate && new Date(p.createdDate) >= cutoffDate;
        return status === "new" ? isNew : !isNew;
      });
    }
    return filterProducts(result, filters, inventory);
  }, [products, status, cutoffDate, filters, inventory]);

  function handleUploadSelected() {
    const ids = Array.from(selectedIds).join(",");
    router.push(`/upload?productIds=${ids}`);
  }

  function handleSearchWeb() {
    const selected = filtered.filter((p) => selectedIds.has(p.productId));
    const searchProducts = selected.map((p) => ({
      productId: p.productId,
      productName: p.productName ?? "Unknown",
      brandName: p.brandName,
      category: p.category,
      strain: p.strain,
    }));

    setSearchDialogOpen(true);
    imageSearch.startSearch(searchProducts);
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Recent Products</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Products recently added or modified in your catalog.
        </p>
      </div>

      <ProductFilterBar
        filters={filters}
        onChange={setFilters}
        products={products}
        summary={isLoading ? "Loading..." : `${filtered.length} of ${products.length} products`}
      >
        <DateRangePicker selectedDays={days} onChange={setDays} />
        <StatusFilter value={status} onChange={setStatus} />
      </ProductFilterBar>

      <div className="flex items-center gap-4 flex-wrap">
        {selectedIds.size > 0 && (
          <span className="text-sm text-muted-foreground">{selectedIds.size} selected</span>
        )}
        {selectedIds.size > 0 && (
          <>
            <Button onClick={handleUploadSelected}>
              <Upload className="h-4 w-4 mr-2" />
              Upload Images for {selectedIds.size} Selected
            </Button>
            <Button variant="outline" onClick={handleSearchWeb}>
              <Search className="h-4 w-4 mr-2" />
              Search Web for Images ({selectedIds.size})
            </Button>
          </>
        )}
      </div>

      <ProductTable
        products={filtered}
        isLoading={isLoading}
        selectable
        selectedIds={selectedIds}
        onSelectionChange={setSelectedIds}
        showNewBadge
        newSinceDays={days}
        inventory={inventory}
        showInventory
        onProductsChanged={() => mutate()}
      />

      <ImageSearchDialog
        open={searchDialogOpen}
        onOpenChange={(open) => {
          setSearchDialogOpen(open);
          if (!open) imageSearch.reset();
        }}
        results={imageSearch.results}
        isSearching={imageSearch.isSearching}
        progress={imageSearch.progress}
        onRetryFailed={imageSearch.retryFailed}
      />
    </div>
  );
}
