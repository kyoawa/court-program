"use client";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { ProductDetail } from "@/lib/types";
import { useMemo } from "react";

interface BrandFilterProps {
  value: string;
  onChange: (value: string) => void;
  products: ProductDetail[];
}

export function BrandFilter({ value, onChange, products }: BrandFilterProps) {
  const brands = useMemo(() => {
    const set = new Set<string>();
    for (const p of products) {
      if (p.brandName) set.add(p.brandName);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [products]);

  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="w-52">
        <SelectValue placeholder="All Brands" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="all">All Brands</SelectItem>
        {brands.map((brand) => (
          <SelectItem key={brand} value={brand}>
            {brand}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
