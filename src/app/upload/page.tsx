"use client";

import { Suspense, useState, useMemo, useCallback, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { useProducts } from "@/hooks/use-products";
import { useUploadQueue } from "@/hooks/use-upload-queue";
import { CategoryFilter } from "@/components/products/category-filter";
import { FileDropZone } from "@/components/upload/file-drop-zone";
import { UrlInputList } from "@/components/upload/url-input-list";
import { UploadQueueTable } from "@/components/upload/upload-queue-table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { Upload, RotateCcw, Trash2, Play, Sparkles, Loader2 } from "lucide-react";
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
  const { products, isLoading: productsLoading } = useProducts({
    isActive: true,
  });
  const queue = useUploadQueue();

  const [category, setCategory] = useState("all");
  const [search, setSearch] = useState("");
  const [selectedProductId, setSelectedProductId] = useState<string>("");
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

  const filteredProducts = useMemo(() => {
    let list = products;
    if (category !== "all") {
      list = list.filter((p) => p.category === category);
    }
    if (search) {
      const s = search.toLowerCase();
      list = list.filter(
        (p) =>
          p.productName?.toLowerCase().includes(s) ||
          p.sku?.toLowerCase().includes(s)
      );
    }
    return list;
  }, [products, category, search]);

  const preselectedProducts = useMemo(
    () => products.filter((p) => preselectedIds.has(p.productId)),
    [products, preselectedIds]
  );

  const selectedProduct = products.find(
    (p) => String(p.productId) === selectedProductId
  );

  const matchFileToProduct = useCallback(
    (file: File): ProductDetail | null => {
      const name = file.name.replace(/\.[^.]+$/, "").toLowerCase();
      const skuMatch = products.find(
        (p) => p.sku && p.sku.toLowerCase() === name
      );
      if (skuMatch) return skuMatch;
      const nameMatch = products.find(
        (p) => p.productName && name.includes(p.productName.toLowerCase())
      );
      return nameMatch ?? null;
    },
    [products]
  );

  function handleFilesAutoMatch(files: File[]) {
    let matched = 0;
    let unmatched = 0;

    for (const file of files) {
      const product = matchFileToProduct(file);
      if (product) {
        queue.addItems([
          {
            productId: product.productId,
            productName: product.productName ?? "Unknown",
            source: { type: "file" as const, file },
          },
        ]);
        matched++;
      } else if (selectedProduct) {
        queue.addItems([
          {
            productId: selectedProduct.productId,
            productName: selectedProduct.productName ?? "Unknown",
            source: { type: "file" as const, file },
          },
        ]);
        matched++;
      } else {
        unmatched++;
      }
    }

    if (matched > 0) toast.success(`Queued ${matched} image(s)`);
    if (unmatched > 0) {
      toast.error(
        `${unmatched} file(s) could not be matched. Select a product first or name files by SKU.`
      );
    }
  }

  function handleAddUrls() {
    const validUrls = urls.filter((u) => u.trim());
    if (validUrls.length === 0) {
      toast.error("Enter at least one URL");
      return;
    }
    if (!selectedProduct && preselectedProducts.length === 0) {
      toast.error("Select a product first");
      return;
    }

    const target = selectedProduct ?? preselectedProducts[0];
    queue.addItems(
      validUrls.map((url) => ({
        productId: target.productId,
        productName: target.productName ?? "Unknown",
        source: { type: "url" as const, url: url.trim() },
      }))
    );
    setUrls([""]);
    toast.success(`Queued ${validUrls.length} URL(s) for ${target.productName}`);
  }

  const queuedMissingDescs = useMemo(() => {
    const seen = new Set<number>();
    const missing: ProductDetail[] = [];
    for (const item of queue.items) {
      if (seen.has(item.productId)) continue;
      seen.add(item.productId);
      const p = products.find((pr) => pr.productId === item.productId);
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
          // Show the generated description immediately
          setGeneratedDescs((prev) => {
            const next = new Map(prev);
            next.set(p.productId, {
              productName: p.productName ?? "Unknown",
              description: data.description,
            });
            return next;
          });
          // Then save to Dutchie
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
            // Description was generated but save failed — still show it
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
    toast.info("Starting upload...");
    await queue.startUpload();
    toast.success(
      `Upload complete: ${queue.stats.success} succeeded, ${queue.stats.failed} failed`
    );
  }

  useEffect(() => {
    if (preselectedProducts.length > 0 && !selectedProductId) {
      setSelectedProductId(String(preselectedProducts[0].productId));
    }
  }, [preselectedProducts, selectedProductId]);

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
        <h2 className="font-semibold">1. Select Target Product</h2>

        {preselectedProducts.length > 0 && (
          <p className="text-sm text-muted-foreground">
            {preselectedProducts.length} product(s) pre-selected.
          </p>
        )}

        <div className="flex items-center gap-3 flex-wrap">
          <CategoryFilter value={category} onChange={setCategory} />
          <Input
            placeholder="Search by name or SKU..."
            className="w-64"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <Select value={selectedProductId} onValueChange={setSelectedProductId}>
          <SelectTrigger className="w-full">
            <SelectValue
              placeholder={
                productsLoading ? "Loading products..." : "Choose a product..."
              }
            />
          </SelectTrigger>
          <SelectContent>
            {filteredProducts.map((p) => (
              <SelectItem key={p.productId} value={String(p.productId)}>
                {p.productName ?? "Unnamed"} ({p.sku ?? "no SKU"}) -{" "}
                {p.category ?? "No category"}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
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
              Drop files here. Files named by SKU will auto-match to products.
              Otherwise they go to the selected product above.
            </p>
            <FileDropZone onFilesSelected={handleFilesAutoMatch} />
          </TabsContent>

          <TabsContent value="urls" className="space-y-3 mt-3">
            <p className="text-sm text-muted-foreground">
              Enter image URLs. They will be uploaded to the selected product
              above.
            </p>
            <UrlInputList urls={urls} onChange={setUrls} />
            <Button variant="outline" size="sm" onClick={handleAddUrls}>
              <Upload className="h-4 w-4 mr-1" />
              Add to Queue
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

        <UploadQueueTable items={queue.items} onRemove={queue.removeItem} />

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
            disabled={queue.stats.queued === 0}
          >
            <Play className="h-4 w-4 mr-1" />
            Start Upload ({queue.stats.queued})
          </Button>
          {queue.stats.failed > 0 && (
            <Button variant="outline" onClick={queue.retryFailed}>
              <RotateCcw className="h-4 w-4 mr-1" />
              Retry Failed ({queue.stats.failed})
            </Button>
          )}
          {queue.stats.success > 0 && (
            <Button variant="ghost" onClick={queue.clearCompleted}>
              <Trash2 className="h-4 w-4 mr-1" />
              Clear Completed
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
