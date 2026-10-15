"use client";

import { Suspense, useState, useMemo, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { useProducts } from "@/hooks/use-products";
import { useInventory } from "@/hooks/use-inventory";
import { useImageSearch } from "@/hooks/use-image-search";
import { useUploadQueue } from "@/hooks/use-upload-queue";
import { ImageSearchDialog } from "@/components/products/image-search-dialog";
import { ProductTable } from "@/components/products/product-table";
import { ProductFilterBar } from "@/components/products/product-filter-bar";
import { EMPTY_FILTERS, filterProducts } from "@/lib/product-filters";
import { FileDropZone } from "@/components/upload/file-drop-zone";
import { UrlInputList } from "@/components/upload/url-input-list";
import { UploadQueueTable } from "@/components/upload/upload-queue-table";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import {
  Upload,
  RotateCcw,
  Trash2,
  Play,
  Sparkles,
  Loader2,
  ChevronDown,
  ChevronUp,
  Search,
} from "lucide-react";
import { toast } from "sonner";
import type { ProductDetail } from "@/lib/types";

export default function UploadPage() {
  return (
    <Suspense>
      <UploadPageContent />
    </Suspense>
  );
}

function UploadPageContent() {
  const searchParams = useSearchParams();
  const { products, isLoading: productsLoading, mutate: mutateProducts } = useProducts({
    isActive: true,
  });
  const { inventory } = useInventory();
  const queue = useUploadQueue();
  const imageSearch = useImageSearch();
  const [searchDialogOpen, setSearchDialogOpen] = useState(false);

  const [replaceExisting, setReplaceExisting] = useState(false);
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [tableCollapsed, setTableCollapsed] = useState(false);
  const [generatingDescs, setGeneratingDescs] = useState(false);
  const [descProgress, setDescProgress] = useState({ current: 0, total: 0 });
  const [generatedDescs, setGeneratedDescs] = useState<
    Map<number, { productName: string; description: string }>
  >(new Map());

  const preselectedIds = useMemo(() => {
    const param = searchParams.get("productIds");
    if (!param) return new Set<number>();
    return new Set(param.split(",").map(Number).filter(Boolean));
  }, [searchParams]);

  const [urls, setUrls] = useState<string[]>([""]);

  const filteredProducts = useMemo(
    () => filterProducts(products, filters, inventory),
    [products, filters, inventory]
  );

  const selectedProducts = useMemo(
    () => products.filter((p) => selectedIds.has(p.productId)),
    [products, selectedIds]
  );

  function handleFindImages() {
    if (selectedProducts.length === 0) {
      toast.error("Select at least one product first");
      return;
    }
    setSearchDialogOpen(true);
    imageSearch.startSearch(selectedProducts.map((p) => ({
      productId: p.productId,
      productName: p.productName ?? "Unknown",
      brandName: p.brandName,
      category: p.category,
      strain: p.strain,
    })));
  }

  function handleFilesSelected(files: File[]) {
    if (queue.isRunning) { toast.error("Pause the batch before adding images."); return; }
    if (selectedIds.size === 0) {
      toast.error("Select at least one product first");
      return;
    }

    const items = selectedProducts.flatMap((product) =>
      files.map((file) => ({
        productId: product.productId,
        productName: product.productName ?? "Unknown",
        source: { type: "file" as const, file },
      }))
    );

    queue.addItems(items);
    toast.success(
      `Queued ${files.length} file(s) for ${selectedProducts.length} product(s) (${items.length} total)`
    );
  }

  function handleAddUrls() {
    if (queue.isRunning) { toast.error("Pause the batch before adding images."); return; }
    const validUrls = urls.filter((u) => u.trim());
    if (validUrls.length === 0) {
      toast.error("Enter at least one URL");
      return;
    }
    if (selectedIds.size === 0) {
      toast.error("Select at least one product first");
      return;
    }

    const items = selectedProducts.flatMap((product) =>
      validUrls.map((url) => ({
        productId: product.productId,
        productName: product.productName ?? "Unknown",
        source: { type: "url" as const, url: url.trim() },
      }))
    );

    queue.addItems(items);
    setUrls([""]);
    toast.success(
      `Queued ${validUrls.length} URL(s) for ${selectedProducts.length} product(s) (${items.length} total)`
    );
  }

  const queuedMissingDescs = useMemo(() => {
    const seen = new Set<number>();
    const missing: ProductDetail[] = [];
    const byId = new Map(products.map(product => [product.productId, product]));
    for (const item of queue.items) {
      if (seen.has(item.productId)) continue;
      seen.add(item.productId);
      const p = byId.get(item.productId);
      if (p && !p.onlineDescription) missing.push(p);
    }
    return missing;
  }, [queue.items, products]);

  async function handleGenerateAllDescriptions() {
    if (queuedMissingDescs.length === 0) return;
    setGeneratingDescs(true);
    setDescProgress({ current: 0, total: queuedMissingDescs.length });
    let success = 0;
    let failed = 0;

    for (let i = 0; i < queuedMissingDescs.length; i++) {
      const p = queuedMissingDescs[i];
      setDescProgress({ current: i + 1, total: queuedMissingDescs.length });
      try {
        const res = await fetch("/api/descriptions/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            productName: p.productName,
            brandName: p.brandName,
            category: p.category,
            strain: p.strain,
            strainType: p.strainType,
            size: p.size,
          }),
        });
        if (!res.ok) throw new Error("Failed to generate");
        const data = await res.json();
        if (data.description) {
          setGeneratedDescs((prev) => {
            const next = new Map(prev);
            next.set(p.productId, {
              productName: p.productName ?? "Unknown",
              description: data.description,
            });
            return next;
          });
          try {
            const saveRes = await fetch("/api/descriptions/set", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                productId: p.productId,
                description: data.description,
              }),
            });
            if (!saveRes.ok) throw new Error("Failed to save");
          } catch {
            failed++;
          }
          success++;
        }
      } catch {
        failed++;
      }
    }

    setGeneratingDescs(false);
    if (success > 0) {
      toast.success(
        `Generated ${success} description(s)${failed > 0 ? `, ${failed} failed to save to Dutchie` : ""}`
      );
    } else {
      toast.error("Failed to generate descriptions");
    }
  }

  async function handleStartUpload() {
    if (queue.stats.queued === 0) {
      toast.error("No images queued for upload");
      return;
    }
    try {
      const result = await queue.startUpload(replaceExisting);
      if (result) {
        const message = `${result.paused ? "Paused" : "Finished"}: ${result.succeeded} succeeded, ${result.failed} failed`;
        if (result.failed) toast.error(message); else toast.success(message);
        await mutateProducts();
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to start upload");
    }
  }

  // Initialize selection from URL params
  useEffect(() => {
    if (preselectedIds.size > 0 && selectedIds.size === 0) {
      setSelectedIds(preselectedIds);
    }
  }, [preselectedIds]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-populate queue from web search results
  useEffect(() => {
    const fromWebSearch = searchParams.get("fromWebSearch");
    if (!fromWebSearch) return;

    const raw = sessionStorage.getItem("webSearchItems");
    if (!raw) return;

    try {
      const items = JSON.parse(raw) as Array<{
        productId: number;
        productName: string;
        imageUrl: string;
      }>;
      if (items.length > 0) {
        queue.addItems(
          items.map((item) => ({
            productId: item.productId,
            productName: item.productName,
            source: { type: "url" as const, url: item.imageUrl },
          }))
        );
        toast.success(
          `Added ${items.length} image(s) from web search to upload queue`
        );
      }
    } catch {
      // ignore malformed data
    }

    sessionStorage.removeItem("webSearchItems");
  }, [searchParams]); // eslint-disable-line react-hooks/exhaustive-deps

  const progressPct =
    queue.stats.total > 0
      ? ((queue.stats.success + queue.stats.failed) / queue.stats.total) * 100
      : 0;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Bulk Image Upload</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Upload images for multiple products at once.
        </p>
      </div>

      <div className="rounded-lg border p-4 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">1. Select Target Products</h2>
          <div className="flex items-center gap-2">
            {selectedIds.size > 0 && (
              <>
                <Badge variant="default">{selectedIds.size} selected</Badge>
                <Button variant="outline" size="sm" onClick={handleFindImages}>
                  <Search className="h-4 w-4 mr-1" />
                  Find Images
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setSelectedIds(new Set())}>
                  Clear selection
                </Button>
              </>
            )}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setTableCollapsed(!tableCollapsed)}
            >
              {tableCollapsed ? (
                <ChevronDown className="h-4 w-4" />
              ) : (
                <ChevronUp className="h-4 w-4" />
              )}
            </Button>
          </div>
        </div>

        {!tableCollapsed && (
          <>
            <ProductFilterBar
              filters={filters}
              onChange={setFilters}
              products={products}
              summary={productsLoading ? "Loading..." : `${filteredProducts.length} of ${products.length} products`}
            />

            <ProductTable
              products={filteredProducts}
              isLoading={productsLoading}
              selectable
              selectedIds={selectedIds}
              onSelectionChange={setSelectedIds}
              inventory={inventory}
              showInventory
              onProductsChanged={() => mutateProducts()}
            />
          </>
        )}
      </div>

      <div className="rounded-lg border p-4 space-y-4">
        <h2 className="font-semibold">2. Add Images</h2>

        <Tabs defaultValue="files">
          <TabsList>
            <TabsTrigger value="files">Local Files</TabsTrigger>
            <TabsTrigger value="urls">Image URLs</TabsTrigger>
          </TabsList>

          <TabsContent value="files" className="space-y-3 mt-3">
            <p className="text-sm text-muted-foreground">
              Drop files here. They will be uploaded to{" "}
              {selectedIds.size === 0
                ? "the selected product(s)."
                : selectedIds.size === 1
                  ? `${selectedProducts[0]?.productName ?? "the selected product"}.`
                  : `all ${selectedIds.size} selected products.`}
            </p>
            <FileDropZone onFilesSelected={handleFilesSelected} />
          </TabsContent>

          <TabsContent value="urls" className="space-y-3 mt-3">
            <p className="text-sm text-muted-foreground">
              Enter image URLs. They will be uploaded to{" "}
              {selectedIds.size === 0
                ? "the selected product(s)."
                : selectedIds.size === 1
                  ? `${selectedProducts[0]?.productName ?? "the selected product"}.`
                  : `all ${selectedIds.size} selected products.`}
            </p>
            <UrlInputList urls={urls} onChange={setUrls} />
            <Button variant="outline" size="sm" onClick={handleAddUrls}>
              <Upload className="h-4 w-4 mr-1" />
              Add to Queue{selectedIds.size > 1 ? ` (${selectedIds.size} products)` : ""}
            </Button>
          </TabsContent>
        </Tabs>
      </div>

      <div className="rounded-lg border p-4 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">3. Upload Queue</h2>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <span>{queue.stats.queued} queued</span>
            <span>{queue.stats.uploading} uploading</span>
            <span className="text-green-600">{queue.stats.success} done</span>
            {queue.stats.failed > 0 && (
              <span className="text-destructive">
                {queue.stats.failed} failed
              </span>
            )}
          </div>
        </div>

        {queue.stats.total > 0 && (
          <Progress value={progressPct} className="h-2" />
        )}

        <div className="space-y-2 rounded-md border p-3">
          <label className="flex items-center gap-2 text-sm font-medium">
            <Checkbox checked={replaceExisting} disabled={queue.isRunning || queue.items.some(item => item.replaceExisting !== undefined)}
              onCheckedChange={checked => setReplaceExisting(checked === true)} />
            Replace all existing images
          </label>
          <p className="text-sm text-muted-foreground">
            {replaceExisting
              ? "Queue one new image per product. Once it is saved, all existing images for that product will be deleted. Missing image IDs or failed deletions are reported per product."
              : "Keep existing images and add the queued images."}
          </p>
          <p className="text-sm text-muted-foreground">Keep this tab open while the batch runs; reloading clears the queue. Pause stops new uploads after the current products finish. Retries keep the original upload mode. Clear the queue to change modes.</p>
        </div>
        <UploadQueueTable items={queue.items} onRemove={queue.removeItem} disabled={queue.isRunning} />

        {queuedMissingDescs.length > 0 && (
          <div className="flex items-center gap-3 rounded-md bg-muted p-3">
            <div className="flex-1 text-sm text-muted-foreground">
              {generatingDescs ? (
                <span className="flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Generating descriptions... {descProgress.current}/{descProgress.total}
                </span>
              ) : (
                <span>
                  {queuedMissingDescs.length} queued product(s) missing descriptions.
                </span>
              )}
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={handleGenerateAllDescriptions}
              disabled={generatingDescs}
            >
              <Sparkles className="h-4 w-4 mr-1" />
              Generate Descriptions
            </Button>
          </div>
        )}

        {generatedDescs.size > 0 && (
          <div className="space-y-2">
            <h3 className="text-sm font-medium">Generated Descriptions</h3>
            <div className="space-y-2 max-h-60 overflow-y-auto">
              {Array.from(generatedDescs.entries()).map(
                ([productId, { productName, description }]) => (
                  <div
                    key={productId}
                    className="rounded-md bg-muted p-3 space-y-1"
                  >
                    <p className="text-xs font-medium">{productName}</p>
                    <p className="text-sm text-muted-foreground">
                      {description}
                    </p>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 text-xs"
                      onClick={() => {
                        navigator.clipboard.writeText(description);
                        toast.success(`Copied description for ${productName}`);
                      }}
                    >
                      Copy
                    </Button>
                  </div>
                )
              )}
            </div>
          </div>
        )}

        <div className="flex items-center gap-2">
          <Button
            onClick={handleStartUpload}
            disabled={queue.isRunning || queue.stats.queued === 0}
          >
            <Play className="h-4 w-4 mr-1" />
            {queue.isRunning ? "Uploading…" : replaceExisting ? "Start Replacement" : "Start Upload"} ({queue.stats.queued})
          </Button>
          {queue.isRunning && <Button variant="outline" onClick={queue.stopUpload}>Pause after current uploads</Button>}
          {queue.stats.failed > 0 && (
            <Button variant="outline" disabled={queue.isRunning} onClick={queue.retryFailed}>
              <RotateCcw className="h-4 w-4 mr-1" />
              Retry Failed ({queue.stats.failed})
            </Button>
          )}
          {queue.stats.success > 0 && (
            <Button variant="ghost" disabled={queue.isRunning} onClick={queue.clearCompleted}>
              <Trash2 className="h-4 w-4 mr-1" />
              Clear Completed
            </Button>
          )}
        </div>
      </div>

      <ImageSearchDialog
        open={searchDialogOpen}
        onOpenChange={(open) => {
          setSearchDialogOpen(open);
          if (!open) imageSearch.reset();
        }}
        results={imageSearch.results}
        isSearching={imageSearch.isSearching}
        progress={imageSearch.progress}
        onSearchSingle={imageSearch.searchSingle}
        onRetryFailed={imageSearch.retryFailed}
        source={imageSearch.source}
        onSourceChange={imageSearch.changeSource}
      />
    </div>
  );
}
