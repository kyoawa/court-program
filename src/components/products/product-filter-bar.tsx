"use client";

import { useMemo, type ReactNode } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useCategories } from "@/hooks/use-categories";
import {
  ALL,
  DESCRIPTION_OPTIONS,
  EMPTY_FILTERS,
  IMAGE_OPTIONS,
  STOCK_OPTIONS,
  buildFacets,
  countActiveFilters,
  type ProductFacets,
  type ProductFilters,
} from "@/lib/product-filters";
import type { ProductDetail } from "@/lib/types";

interface ProductFilterBarProps {
  filters: ProductFilters;
  onChange: (filters: ProductFilters) => void;
  /** Products used to derive brand, vendor and strain-type options. */
  products?: ProductDetail[];
  /** Catalog-wide options; takes precedence over `products` when given. */
  facets?: Partial<ProductFacets>;
  /** Hide controls that make no sense on a page (e.g. images on Missing Images). */
  hide?: Partial<Record<"stock" | "images" | "description" | "strainType", boolean>>;
  /** Rendered at the end of the bar, before the summary. */
  children?: ReactNode;
  summary?: ReactNode;
}

const SEARCH_HELP =
  'Every word must match. Use "quotes" for phrases, -word to exclude, and brand:, vendor:, sku:, strain:, type:, category:, size:, id: or desc: to target one field.';

function FilterSelect({
  value,
  onChange,
  allLabel,
  options,
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  allLabel: string;
  options: { value: string; label: string }[];
  className?: string;
}) {
  // A selected value that is no longer in the option list (e.g. after the
  // product set changes) is still shown so the user can clear it.
  const known = options.some((option) => option.value === value);
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className={className ?? "w-44"} size="sm">
        <SelectValue placeholder={allLabel} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={ALL}>{allLabel}</SelectItem>
        {!known && value !== ALL && <SelectItem value={value}>{value}</SelectItem>}
        {options.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export function ProductFilterBar({
  filters,
  onChange,
  products,
  facets,
  hide,
  children,
  summary,
}: ProductFilterBarProps) {
  const { categories } = useCategories();
  const derived = useMemo(() => buildFacets(products ?? []), [products]);
  const brands = facets?.brands ?? derived.brands;
  const vendors = facets?.vendors ?? derived.vendors;
  const strainTypes = facets?.strainTypes ?? derived.strainTypes;
  const categoryOptions = useMemo(() => {
    const names = categories
      .map((category) => category.productCategoryName)
      .filter((name): name is string => Boolean(name));
    const source = names.length ? names : (facets?.categories ?? derived.categories);
    return source.map((name) => ({ value: name, label: name }));
  }, [categories, facets?.categories, derived.categories]);

  const active = countActiveFilters(filters);
  const set = <K extends keyof ProductFilters>(key: K, value: ProductFilters[K]) =>
    onChange({ ...filters, [key]: value });
  const toOptions = (values: string[]) => values.map((value) => ({ value, label: value }));

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 flex-wrap">
        <Input
          placeholder="Search name, SKU, brand, vendor, strain…"
          className="w-72 h-8"
          value={filters.query}
          onChange={(event) => set("query", event.target.value)}
          title={SEARCH_HELP}
          aria-label="Search products"
        />
        <FilterSelect value={filters.category} onChange={(v) => set("category", v)} allLabel="All categories" options={categoryOptions} />
        <FilterSelect value={filters.brand} onChange={(v) => set("brand", v)} allLabel="All brands" options={toOptions(brands)} />
        <FilterSelect value={filters.vendor} onChange={(v) => set("vendor", v)} allLabel="All vendors" options={toOptions(vendors)} />
        {!hide?.strainType && (
          <FilterSelect value={filters.strainType} onChange={(v) => set("strainType", v)} allLabel="All strain types" options={toOptions(strainTypes)} className="w-40" />
        )}
        {!hide?.stock && (
          <FilterSelect value={filters.stock} onChange={(v) => set("stock", v)} allLabel="Any stock status" options={STOCK_OPTIONS} className="w-48" />
        )}
        {!hide?.images && (
          <FilterSelect value={filters.images} onChange={(v) => set("images", v as ProductFilters["images"])} allLabel="Any image count" options={IMAGE_OPTIONS} className="w-40" />
        )}
        {!hide?.description && (
          <FilterSelect value={filters.description} onChange={(v) => set("description", v as ProductFilters["description"])} allLabel="Any description" options={DESCRIPTION_OPTIONS} className="w-44" />
        )}
        {active > 0 && (
          <Button variant="ghost" size="sm" className="h-8" onClick={() => onChange(EMPTY_FILTERS)}>
            <X className="h-3.5 w-3.5 mr-1" />
            Clear {active} filter{active === 1 ? "" : "s"}
          </Button>
        )}
        {children}
        {summary !== undefined && (
          <span className="text-sm text-muted-foreground ml-auto">{summary}</span>
        )}
      </div>
      <p className="text-xs text-muted-foreground">{SEARCH_HELP}</p>
    </div>
  );
}
