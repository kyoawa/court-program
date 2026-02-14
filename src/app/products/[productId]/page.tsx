"use client";

import { use, useState, useMemo, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useProducts } from "@/hooks/use-products";
import { FileDropZone } from "@/components/upload/file-drop-zone";
import { fileToBase64 } from "@/lib/image-utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ArrowLeft, ImageOff, Loader2, Sparkles, Copy, Check, Save, FolderOpen } from "lucide-react";
import type { MatchResult } from "@/lib/types";
import { toast } from "sonner";

export default function ProductDetailPage({
  params,
}: {
  params: Promise<{ productId: string }>;
}) {
  const { productId } = use(params);
  const router = useRouter();
  const { products, isLoading, mutate } = useProducts({ isActive: true });
  const [uploading, setUploading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [generatedDesc, setGeneratedDesc] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [saving, setSaving] = useState(false);
  const [repoMatch, setRepoMatch] = useState<MatchResult | null>(null);
  const [applyingRepo, setApplyingRepo] = useState(false);

  const product = useMemo(
    () => products.find((p) => String(p.productId) === productId),
    [products, productId]
  );

  const imageUrls = useMemo(() => {
    if (!product) return [];
    if (product.imageUrls && product.imageUrls.length > 0) {
      return product.imageUrls;
    }
    if (product.imageUrl) return [product.imageUrl];
    return [];
  }, [product]);

  // Check for repository match when product has no images
  useEffect(() => {
    if (!product || imageUrls.length > 0) return;
    fetch("/api/repository/match", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        products: [
          {
            productId: product.productId,
            productName: product.productName,
            brandName: product.brandName,
            category: product.category,
            strain: product.strain,
            strainType: product.strainType,
          },
        ],
      }),
    })
      .then((res) => (res.ok ? res.json() : []))
      .then((matches: MatchResult[]) => {
        const m = matches.find((r) => r.matchedImageId !== null);
        setRepoMatch(m ?? null);
      })
      .catch(() => {});
  }, [product, imageUrls.length]);

  async function handleApplyRepoImage() {
    if (!repoMatch?.matchedImageId || !product) return;
    setApplyingRepo(true);
    try {
      const res = await fetch("/api/repository/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: [
            {
              productId: product.productId,
              imageId: repoMatch.matchedImageId,
              productName: product.productName,
            },
          ],
        }),
      });
      if (!res.ok) throw new Error("Failed");
      // Read through the SSE stream
      const reader = res.body?.getReader();
      if (reader) {
        while (true) {
          const { done } = await reader.read();
          if (done) break;
        }
      }
      toast.success("Image applied from repository");
      setRepoMatch(null);
      mutate();
    } catch {
      toast.error("Failed to apply repository image");
    } finally {
      setApplyingRepo(false);
    }
  }

  async function handleGenerateDescription() {
    if (!product) return;
    setGenerating(true);
    setGeneratedDesc(null);
    try {
      const res = await fetch("/api/descriptions/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          productName: product.productName,
          brandName: product.brandName,
          category: product.category,
          strain: product.strain,
          strainType: product.strainType,
          size: product.size,
        }),
      });
      if (!res.ok) throw new Error("Failed to generate description");
      const data = await res.json();
      setGeneratedDesc(data.description);
    } catch {
      toast.error("Failed to generate description");
    } finally {
      setGenerating(false);
    }
  }

  async function handleCopyDescription() {
    if (!generatedDesc) return;
    await navigator.clipboard.writeText(generatedDesc);
    setCopied(true);
    toast.success("Copied to clipboard");
    setTimeout(() => setCopied(false), 2000);
  }

  async function handleSaveDescription() {
    if (!generatedDesc || !product) return;
    setSaving(true);
    try {
      const res = await fetch("/api/descriptions/set", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          productId: product.productId,
          description: generatedDesc,
        }),
      });
      if (!res.ok) throw new Error("Failed to save");
      toast.success("Description saved to Dutchie");
      setGeneratedDesc(null);
      mutate();
    } catch {
      toast.error("Failed to save description");
    } finally {
      setSaving(false);
    }
  }

  async function handleUploadFiles(files: File[]) {
    if (!product) return;
    setUploading(true);
    let success = 0;
    let failed = 0;

    for (const file of files) {
      try {
        const base64 = await fileToBase64(file);
        const res = await fetch("/api/images/set", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            productId: product.productId,
            base64Image: base64,
            fileName: file.name,
          }),
        });
        if (!res.ok) throw new Error("Upload failed");
        success++;
      } catch {
        failed++;
      }
    }

    setUploading(false);
    mutate();
    if (success > 0) toast.success(`Uploaded ${success} image(s)`);
    if (failed > 0) toast.error(`${failed} image(s) failed to upload`);
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!product) {
    return (
      <div className="space-y-4">
        <Button variant="ghost" onClick={() => router.back()}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back
        </Button>
        <p className="text-muted-foreground">Product not found.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-4xl">
      <Button variant="ghost" onClick={() => router.back()}>
        <ArrowLeft className="h-4 w-4 mr-2" />
        Back
      </Button>

      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold">{product.productName}</h1>
          <p className="text-sm text-muted-foreground mt-1">
            SKU: {product.sku ?? "N/A"} | ID: {product.productId}
          </p>
        </div>
        <Badge variant={product.isActive ? "default" : "secondary"}>
          {product.isActive ? "Active" : "Inactive"}
        </Badge>
      </div>

      <div className="grid grid-cols-2 gap-4 rounded-lg border p-4">
        <InfoRow label="Category" value={product.category} />
        <InfoRow label="Brand" value={product.brandName} />
        <InfoRow label="Strain" value={product.strain} />
        <InfoRow label="Strain Type" value={product.strainType} />
        <InfoRow label="Size" value={product.size} />
        <InfoRow
          label="Net Weight"
          value={
            product.netWeight
              ? `${product.netWeight} ${product.netWeightUnit ?? ""}`
              : null
          }
        />
        <InfoRow
          label="THC"
          value={
            product.thcContent
              ? `${product.thcContent}${product.thcContentUnit ?? ""}`
              : null
          }
        />
        <InfoRow
          label="CBD"
          value={
            product.cbdContent
              ? `${product.cbdContent}${product.cbdContentUnit ?? ""}`
              : null
          }
        />
        <InfoRow
          label="Retail Price"
          value={product.recPrice ? `$${product.recPrice.toFixed(2)}` : null}
        />
        <InfoRow
          label="Medical Price"
          value={product.medPrice ? `$${product.medPrice.toFixed(2)}` : null}
        />
        <InfoRow
          label="Created"
          value={
            product.createdDate
              ? new Date(product.createdDate).toLocaleDateString()
              : null
          }
        />
        <InfoRow
          label="Last Modified"
          value={
            product.lastModifiedDateUTC
              ? new Date(product.lastModifiedDateUTC).toLocaleDateString()
              : null
          }
        />
      </div>

      <div className="rounded-lg border p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="font-medium">Description</h3>
          <Button
            variant="outline"
            size="sm"
            onClick={handleGenerateDescription}
            disabled={generating}
          >
            {generating ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Sparkles className="h-4 w-4 mr-2" />
            )}
            {generating ? "Generating..." : "Generate Description"}
          </Button>
        </div>
        {product.onlineDescription && (
          <p className="text-sm text-muted-foreground">{product.onlineDescription}</p>
        )}
        {!product.onlineDescription && !generatedDesc && (
          <p className="text-sm text-muted-foreground">No description yet.</p>
        )}
        {generatedDesc && (
          <div className="rounded-md bg-muted p-3 space-y-2">
            <p className="text-sm">{generatedDesc}</p>
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={handleCopyDescription}
              >
                {copied ? (
                  <Check className="h-3 w-3 mr-1" />
                ) : (
                  <Copy className="h-3 w-3 mr-1" />
                )}
                {copied ? "Copied" : "Copy"}
              </Button>
              <Button
                size="sm"
                onClick={handleSaveDescription}
                disabled={saving}
              >
                {saving ? (
                  <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                ) : (
                  <Save className="h-3 w-3 mr-1" />
                )}
                {saving ? "Saving..." : "Save to Dutchie"}
              </Button>
            </div>
          </div>
        )}
      </div>

      <Separator />

      <div className="space-y-4">
        <h2 className="text-lg font-semibold">
          Images ({imageUrls.length})
        </h2>

        {imageUrls.length > 0 ? (
          <div className="grid grid-cols-4 gap-4">
            {imageUrls.map((url, i) => (
              <div key={i} className="rounded-lg border overflow-hidden">
                <img
                  src={url}
                  alt={`${product.productName} image ${i + 1}`}
                  className="w-full aspect-square object-cover"
                  loading="lazy"
                />
              </div>
            ))}
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-muted-foreground py-4">
              <ImageOff className="h-5 w-5" />
              <span>No images for this product.</span>
            </div>
            {repoMatch && repoMatch.matchedImageId && (
              <div className="flex items-center gap-4 rounded-md bg-muted p-3">
                <img
                  src={`/api/repository/images/${repoMatch.matchedImageId}`}
                  alt=""
                  className="w-16 h-16 rounded object-cover"
                />
                <div className="flex-1">
                  <p className="text-sm font-medium">
                    Repository match: {repoMatch.matchedImageName}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Matched from image repository rules
                  </p>
                </div>
                <Button
                  size="sm"
                  onClick={handleApplyRepoImage}
                  disabled={applyingRepo}
                >
                  {applyingRepo ? (
                    <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                  ) : (
                    <FolderOpen className="h-4 w-4 mr-1" />
                  )}
                  {applyingRepo ? "Applying..." : "Use This Image"}
                </Button>
              </div>
            )}
          </div>
        )}

        <div className="space-y-2">
          <h3 className="font-medium text-sm">Add Image</h3>
          {uploading && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Uploading...
            </div>
          )}
          <FileDropZone onFilesSelected={handleUploadFiles} />
        </div>
      </div>
    </div>
  );
}

function InfoRow({
  label,
  value,
}: {
  label: string;
  value: string | null | undefined;
}) {
  return (
    <div>
      <span className="text-xs text-muted-foreground">{label}</span>
      <p className="text-sm font-medium">{value ?? "-"}</p>
    </div>
  );
}
