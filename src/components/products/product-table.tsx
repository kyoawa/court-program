"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { ImageOff, ArrowUpDown, ChevronLeft, ChevronRight, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PRODUCTS_PER_PAGE } from "@/lib/constants";
import type { ProductDetail } from "@/lib/types";

interface ProductTableProps {
  products: ProductDetail[];
  isLoading?: boolean;
  selectable?: boolean;
  selectedIds?: Set<number>;
  onSelectionChange?: (ids: Set<number>) => void;
  showNewBadge?: boolean;
  newSinceDays?: number;
}

type SortField = "productName" | "category" | "lastModifiedDateUTC" | "brandName";
type SortDir = "asc" | "desc";

export function ProductTable({
  products,
  isLoading,
  selectable,
  selectedIds,
  onSelectionChange,
  showNewBadge,
  newSinceDays,
}: ProductTableProps) {
  const [sortField, setSortField] = useState<SortField>("lastModifiedDateUTC");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [page, setPage] = useState(0);

  // Reset page when products change
  const productKey = products.length;
  const [lastKey, setLastKey] = useState(productKey);
  if (productKey !== lastKey) {
    setPage(0);
    setLastKey(productKey);
  }

  const sorted = useMemo(() => {
    return [...products].sort((a, b) => {
      const aVal = a[sortField] ?? "";
      const bVal = b[sortField] ?? "";
      const cmp = String(aVal).localeCompare(String(bVal));
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [products, sortField, sortDir]);

  const totalPages = Math.max(1, Math.ceil(sorted.length / PRODUCTS_PER_PAGE));
  const paged = sorted.slice(
    page * PRODUCTS_PER_PAGE,
    (page + 1) * PRODUCTS_PER_PAGE
  );

  const cutoffDate = useMemo(() => {
    if (!newSinceDays) return null;
    const d = new Date();
    d.setDate(d.getDate() - newSinceDays);
    return d;
  }, [newSinceDays]);

  function toggleSort(field: SortField) {
    if (sortField === field) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDir(field === "lastModifiedDateUTC" ? "desc" : "asc");
    }
    setPage(0);
  }

  function toggleAll() {
    if (!onSelectionChange) return;
    if (selectedIds && selectedIds.size === products.length) {
      onSelectionChange(new Set());
    } else {
      onSelectionChange(new Set(products.map((p) => p.productId)));
    }
  }

  function toggleOne(id: number) {
    if (!onSelectionChange || !selectedIds) return;
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onSelectionChange(next);
  }

  function getImageCount(p: ProductDetail): number {
    if (p.imageUrls && p.imageUrls.length > 0) return p.imageUrls.length;
    if (p.imageUrl) return 1;
    return 0;
  }

  function isNew(p: ProductDetail): boolean {
    if (!showNewBadge || !cutoffDate || !p.createdDate) return false;
    return new Date(p.createdDate) >= cutoffDate;
  }

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

  const SortButton = ({
    field,
    children,
  }: {
    field: SortField;
    children: React.ReactNode;
  }) => (
    <Button
      variant="ghost"
      size="sm"
      className="-ml-3 h-8 font-medium"
      onClick={() => toggleSort(field)}
    >
      {children}
      <ArrowUpDown className="ml-1 h-3 w-3" />
    </Button>
  );

  return (
    <div className="space-y-3">
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              {selectable && (
                <TableHead className="w-10">
                  <Checkbox
                    checked={
                      selectedIds
                        ? selectedIds.size === products.length &&
                          products.length > 0
                        : false
                    }
                    onCheckedChange={toggleAll}
                  />
                </TableHead>
              )}
              <TableHead className="w-16">Image</TableHead>
              <TableHead>
                <SortButton field="productName">Product</SortButton>
              </TableHead>
              <TableHead>SKU</TableHead>
              <TableHead>
                <SortButton field="category">Category</SortButton>
              </TableHead>
              <TableHead>
                <SortButton field="brandName">Brand</SortButton>
              </TableHead>
              <TableHead>Strain</TableHead>
              <TableHead>
                <SortButton field="lastModifiedDateUTC">Modified</SortButton>
              </TableHead>
              <TableHead className="text-center">Images</TableHead>
              <TableHead className="text-center">Desc</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {paged.map((product) => {
              const imgCount = getImageCount(product);
              const productIsNew = isNew(product);
              return (
                <TableRow key={product.productId}>
                  {selectable && (
                    <TableCell>
                      <Checkbox
                        checked={selectedIds?.has(product.productId) ?? false}
                        onCheckedChange={() => toggleOne(product.productId)}
                      />
                    </TableCell>
                  )}
                  <TableCell>
                    {product.imageUrl ? (
                      <img
                        src={product.imageUrl}
                        alt={product.productName ?? ""}
                        className="w-10 h-10 rounded object-cover"
                        loading="lazy"
                      />
                    ) : (
                      <div className="w-10 h-10 rounded bg-muted flex items-center justify-center">
                        <ImageOff className="h-4 w-4 text-muted-foreground" />
                      </div>
                    )}
                  </TableCell>
                  <TableCell>
                    <Link
                      href={`/products/${product.productId}`}
                      className="font-medium hover:underline"
                    >
                      {product.productName ?? "Unnamed"}
                    </Link>
                    {productIsNew && (
                      <Badge variant="default" className="ml-2 text-xs">
                        NEW
                      </Badge>
                    )}
                    {showNewBadge && !productIsNew && (
                      <Badge variant="secondary" className="ml-2 text-xs">
                        MODIFIED
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-muted-foreground text-sm">
                    {product.sku ?? "-"}
                  </TableCell>
                  <TableCell>{product.category ?? "-"}</TableCell>
                  <TableCell>{product.brandName ?? "-"}</TableCell>
                  <TableCell>
                    {product.strain ?? "-"}
                    {product.strainType && (
                      <span className="text-muted-foreground text-xs ml-1">
                        ({product.strainType})
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="text-sm">
                    {product.lastModifiedDateUTC
                      ? new Date(product.lastModifiedDateUTC).toLocaleDateString()
                      : "-"}
                  </TableCell>
                  <TableCell className="text-center">
                    {imgCount === 0 ? (
                      <Badge variant="destructive" className="text-xs">
                        None
                      </Badge>
                    ) : (
                      <span className="text-sm">{imgCount}</span>
                    )}
                  </TableCell>
                  <TableCell className="text-center">
                    {product.onlineDescription ? (
                      <FileText className="h-4 w-4 text-green-600 inline-block" />
                    ) : (
                      <Badge variant="destructive" className="text-xs">
                        None
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={product.isActive ? "default" : "secondary"}
                      className="text-xs"
                    >
                      {product.isActive ? "Active" : "Inactive"}
                    </Badge>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">
            Showing {page * PRODUCTS_PER_PAGE + 1}-
            {Math.min((page + 1) * PRODUCTS_PER_PAGE, sorted.length)} of{" "}
            {sorted.length}
          </span>
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="sm"
              disabled={page === 0}
              onClick={() => setPage((p) => p - 1)}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="text-sm px-2">
              {page + 1} / {totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= totalPages - 1}
              onClick={() => setPage((p) => p + 1)}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
