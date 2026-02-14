"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Loader2, Play, Search } from "lucide-react";
import { toast } from "sonner";
import type { ProductDetail, MatchResult } from "@/lib/types";

interface MatchPreviewProps {
  products: ProductDetail[];
  productsLoading: boolean;
}

export function MatchPreview({ products, productsLoading }: MatchPreviewProps) {
  const [matches, setMatches] = useState<MatchResult[]>([]);
  const [matching, setMatching] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [applying, setApplying] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });

  async function handleFindMatches() {
    setMatching(true);
    setMatches([]);
    setSelectedIds(new Set());
    try {
      const res = await fetch("/api/repository/match", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          products: products.map((p) => ({
            productId: p.productId,
            productName: p.productName,
            brandName: p.brandName,
            category: p.category,
            strain: p.strain,
            strainType: p.strainType,
          })),
        }),
      });
      if (!res.ok) throw new Error("Failed to match");
      const data = (await res.json()) as MatchResult[];
      const matched = data.filter((m) => m.matchedImageId !== null);
      setMatches(matched);
      setSelectedIds(new Set(matched.map((m) => m.productId)));
      if (matched.length === 0) {
        toast.info("No products matched any repository rules");
      } else {
        toast.success(`${matched.length} product(s) matched`);
      }
    } catch {
      toast.error("Failed to find matches");
    } finally {
      setMatching(false);
    }
  }

  function toggleSelect(productId: number) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(productId)) next.delete(productId);
      else next.add(productId);
      return next;
    });
  }

  function toggleAll() {
    if (selectedIds.size === matches.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(matches.map((m) => m.productId)));
    }
  }

  async function handleApply() {
    const items = matches
      .filter((m) => selectedIds.has(m.productId) && m.matchedImageId)
      .map((m) => ({
        productId: m.productId,
        imageId: m.matchedImageId!,
        productName: m.productName,
      }));

    if (items.length === 0) return;

    setApplying(true);
    setProgress({ done: 0, total: items.length });

    try {
      const res = await fetch("/api/repository/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items }),
      });

      if (!res.ok || !res.body) throw new Error("Failed to apply");

      const reader = res.body.getReader();
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
              setProgress((p) => ({ ...p, done: p.done + 1 }));
            } else if (event.type === "error") {
              failed++;
              setProgress((p) => ({ ...p, done: p.done + 1 }));
            }
          } catch {
            // skip
          }
        }
      }

      toast.success(
        `Applied ${success} image(s)${failed > 0 ? `, ${failed} failed` : ""}`
      );
    } catch {
      toast.error("Failed to apply images");
    } finally {
      setApplying(false);
    }
  }

  const progressPct =
    progress.total > 0 ? (progress.done / progress.total) * 100 : 0;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold">Match Products</h3>
        <Button
          variant="outline"
          onClick={handleFindMatches}
          disabled={matching || productsLoading}
        >
          {matching ? (
            <Loader2 className="h-4 w-4 mr-1 animate-spin" />
          ) : (
            <Search className="h-4 w-4 mr-1" />
          )}
          {matching ? "Matching..." : "Find Matches"}
        </Button>
      </div>

      <p className="text-sm text-muted-foreground">
        Finds products that match your repository rules and lets you bulk-apply
        images to Dutchie.
      </p>

      {matches.length > 0 && (
        <>
          {applying && <Progress value={progressPct} className="h-2" />}

          <div className="rounded-md border max-h-80 overflow-y-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">
                    <Checkbox
                      checked={
                        selectedIds.size === matches.length &&
                        matches.length > 0
                      }
                      onCheckedChange={toggleAll}
                    />
                  </TableHead>
                  <TableHead>Product</TableHead>
                  <TableHead>Brand</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Matched Image</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {matches.map((m) => (
                  <TableRow key={m.productId}>
                    <TableCell>
                      <Checkbox
                        checked={selectedIds.has(m.productId)}
                        onCheckedChange={() => toggleSelect(m.productId)}
                      />
                    </TableCell>
                    <TableCell className="font-medium text-sm">
                      {m.productName ?? "Unknown"}
                    </TableCell>
                    <TableCell className="text-sm">
                      {products.find((p) => p.productId === m.productId)
                        ?.brandName ?? "-"}
                    </TableCell>
                    <TableCell className="text-sm">
                      {products.find((p) => p.productId === m.productId)
                        ?.category ?? "-"}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        {m.matchedImageId && (
                          <img
                            src={`/api/repository/images/${m.matchedImageId}`}
                            alt=""
                            className="w-8 h-8 rounded object-cover"
                          />
                        )}
                        <Badge variant="secondary" className="text-xs">
                          {m.matchedImageName}
                        </Badge>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <Button
            onClick={handleApply}
            disabled={selectedIds.size === 0 || applying}
          >
            {applying ? (
              <Loader2 className="h-4 w-4 mr-1 animate-spin" />
            ) : (
              <Play className="h-4 w-4 mr-1" />
            )}
            {applying
              ? `Applying... ${progress.done}/${progress.total}`
              : `Apply to ${selectedIds.size} Product(s)`}
          </Button>
        </>
      )}
    </div>
  );
}
