"use client";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type ProductStatus = "all" | "new" | "modified";

const options: { label: string; value: ProductStatus }[] = [
  { label: "All", value: "all" },
  { label: "New", value: "new" },
  { label: "Modified", value: "modified" },
];

interface StatusFilterProps {
  value: ProductStatus;
  onChange: (value: ProductStatus) => void;
}

export function StatusFilter({ value, onChange }: StatusFilterProps) {
  return (
    <div className="flex items-center gap-1">
      {options.map((opt) => (
        <Button
          key={opt.value}
          variant={value === opt.value ? "default" : "outline"}
          size="sm"
          onClick={() => onChange(opt.value)}
          className={cn("text-xs")}
        >
          {opt.label}
        </Button>
      ))}
    </div>
  );
}
