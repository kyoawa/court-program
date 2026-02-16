"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useProducts } from "@/hooks/use-products";
import { useImageSearch } from "@/hooks/use-image-search";
import { ProductTable } from "@/components/products/product-table";
import { CategoryFilter } from "@/components/products/category-filter";
import { BrandFilter } from "@/components/products/brand-filter";
import { StatusFilter, type ProductStatus } from "@/components/products/status-filter";
import {
  DateRangePicker,
  getDaysAgoISO,
} from "@/components/products/date-range-picker";
import { ImageSearchDialog } from "@/components/products/image-search-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Upload, ImageOff, Package, Search, FolderOpen, Loader2 } from "lucide-react";
import { toast } from "sonner";
import type { MatchResult } from "@/lib/types";

function hasNoImage(p: { imageUrl: string | null; imageUrls: string[] | null }) {
  return (!p.imageUrl || p.imageUrl.trim() === "") &&
    (!p.imageUrls || p.imageUrls.length === 0);
}

export default function MissingImagesPage() {
  const router = useRouter();
  const [category, setCategory] = useState("all");
  const [brand, setBrand] = useState("all");
  const [status, setStatus] = useState<ProductStatus>("all");
  const [days, setDays] = useState(0);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [searchDialogOpen, setSearchDialogOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [applyingRepo, setApplyingRepo] = useState(false);
  const [repoProgress, setRepoProgress] = useState({ done: 0, total: 0 });

  const fromDate = useMemo(() => getDaysAgoISO(days), [days]);
  const { products, isLoading } = useProducts({
    fromLastModifiedDateUTC: fromDate,
    isActive: true,
  });
  const imageSearch = useImageSearch();

  const allMissing = useMemo(
    () => products.filter(hasNoImage),
    [products]
  );

  const cutoffDate = useMemo(() => {
    if (days === 0) return null;
    const d = new Date();
    d.setDate(d.getDate() - days);
    return d;
  }, [days]);

  const filtered = useMemo(() => {
    let result = allMissing;
    if (category !== "all") {
      result = result.filter((p) => p.category === category);
    }
    if (brand !== "all") {
      result = result.filter((p) => p.brandName === brand);
    }
    if (status !== "all" && cutoffDate) {
      result = result.filter((p) => {
        const isNew = p.createdDate && new Date(p.createdDate) >= cutoffDate;
        return status === "new" ? isNew : !isNew;
      });
    }
    if (searchQuery.trim()) {
      const keywords = searchQuery.toLowerCase().split(/\s+/).filter(Boolean);
      result = result.filter((p) => {
        const name = (p.productName ?? "").toLowerCase();
        return keywords.every((kw) => name.includes(kw));
      });
    }
    return result;
  }, [allMissing, category, brand, status, cutoffDate, searchQuery]);

  const totalProducts = products.length;
  const missingCount = allMissing.length;
  const pct =
    totalProducts > 0 ? ((missingCount / totalProducts) * 100).toFixed(1) : "0";

  function handleUploadSelected() {
    const ids = Array.from(selectedIds).join(",");
    router.push(`/upload?productIds=${ids}`);
  }

  async function handleApplyFromRepo() {
    const selected = filtered.filter((p) => selectedIds.has(p.productId));
    if (selected.length === 0) return;

    setApplyingRepo(true);
    try {
      // Find matches
      const matchRes = await fetch("/api/repository/match", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          products: selected.map((p) => ({
            productId: p.productId,
            productName: p.productName,
            brandName: p.brandName,
            category: p.category,
            strain: p.strain,
            strainType: p.strainType,
          })),
        }),
      });
      if (!matchRes.ok) throw new Error("Failed to match");
      const matches = ((await matchRes.json()) as MatchResult[]).filter(
        (m) => m.matchedImageId !== null
      );

      if (matches.length === 0) {
        toast.info("No products matched any repository rules");
        setApplyingRepo(false);
        return;
      }

      // Apply matches
      const items = matches.map((m) => ({
        productId: m.productId,
        imageId: m.matchedImageId!,
        productName: m.productName,
      }));
      setRepoProgress({ done: 0, total: items.length });

      const applyRes = await fetch("/api/repository/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items }),
      });
      if (!applyRes.ok || !applyRes.body) throw new Error("Failed to apply");

      const reader = applyRes.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let success = 0;
      let failed = 0;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          const data = line.replace(/^data:\s*/, "");
          if (!data) continue;
          try {
            const event = JSON.parse(data);
            if (event.type === "success") {
              success++;
              setRepoProgress((p) => ({ ...p, done: p.done + 1 }));
            } else if (event.type === "error") {
              failed++;
              setRepoProgress((p) => ({ ...p, done: p.done + 1 }));
            }
          } catch { /* skip */ }
        }
      }

      toast.success(
        `Applied ${success} image(s) from repository${failed > 0 ? `, ${failed} failed` : ""}`
      );
    } catch {
      toast.error("Failed to apply repository images");
    } finally {
      setApplyingRepo(false);
    }
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
        <h1 className="text-2xl font-bold">Missing Images</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Products in your catalog that have no images.
        </p>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div className="rounded-lg border p-4">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Package className="h-4 w-4" />
            Total Products
          </div>
          <div className="text-2xl font-bold mt-1">
            {isLoading ? "-" : totalProducts}
          </div>
        </div>
        <div className="rounded-lg border p-4">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <ImageOff className="h-4 w-4" />
            Missing Images
          </div>
          <div className="text-2xl font-bold mt-1 text-destructive">
            {isLoading ? "-" : missingCount}
          </div>
        </div>
        <div className="rounded-lg border p-4">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            % Missing
          </div>
          <div className="text-2xl font-bold mt-1">
            {isLoading ? "-" : `${pct}%`}
          </div>
        </div>
      </div>

      <div className="flex items-center gap-4 flex-wrap">
        <Input
          placeholder="Search by name..."
          className="w-48 h-9"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
        <DateRangePicker selectedDays={days} onChange={setDays} />
        <CategoryFilter value={category} onChange={setCategory} />
        <BrandFilter value={brand} onChange={setBrand} products={allMissing} />
        <StatusFilter value={status} onChange={setStatus} />
        {selectedIds.size > 0 && (
          <>
            <Button onClick={handleUploadSelected}>
              <Upload className="h-4 w-4 mr-2" />
              Upload Images for {selectedIds.size} Selected
            </Button>
            <Button variant="outline" onClick={handleSearchWeb}>
              <Search className="h-4 w-4 mr-2" />
              Search Web ({selectedIds.size})
            </Button>
            <Button variant="outline" onClick={handleApplyFromRepo} disabled={applyingRepo}>
              {applyingRepo ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <FolderOpen className="h-4 w-4 mr-2" />
              )}
              {applyingRepo
                ? `Applying... ${repoProgress.done}/${repoProgress.total}`
                : `Apply from Repository (${selectedIds.size})`}
            </Button>
          </>
        )}
        <span className="text-sm text-muted-foreground ml-auto">
          {isLoading ? "Loading..." : `${filtered.length} products missing images`}
        </span>
      </div>

      <ProductTable
        products={filtered}
        isLoading={isLoading}
        selectable
        selectedIds={selectedIds}
        onSelectionChange={setSelectedIds}
        showNewBadge={days > 0}
        newSinceDays={days > 0 ? days : undefined}
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
      />
    </div>
  );
}
