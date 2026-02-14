"use client";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useCategories } from "@/hooks/use-categories";

interface CategoryFilterProps {
  value: string;
  onChange: (value: string) => void;
}

export function CategoryFilter({ value, onChange }: CategoryFilterProps) {
  const { categories, isLoading } = useCategories();

  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="w-52">
        <SelectValue placeholder={isLoading ? "Loading..." : "All Categories"} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="all">All Categories</SelectItem>
        {categories.map((cat) => (
          <SelectItem
            key={cat.productCategoryId}
            value={cat.productCategoryName ?? String(cat.productCategoryId)}
          >
            {cat.productCategoryName ?? `Category ${cat.productCategoryId}`}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
