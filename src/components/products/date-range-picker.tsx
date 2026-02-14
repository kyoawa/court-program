"use client";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const ranges = [
  { label: "24h", days: 1 },
  { label: "7d", days: 7 },
  { label: "30d", days: 30 },
  { label: "90d", days: 90 },
  { label: "All", days: 0 },
];

interface DateRangePickerProps {
  selectedDays: number;
  onChange: (days: number) => void;
}

export function DateRangePicker({
  selectedDays,
  onChange,
}: DateRangePickerProps) {
  return (
    <div className="flex items-center gap-1">
      {ranges.map((range) => (
        <Button
          key={range.days}
          variant={selectedDays === range.days ? "default" : "outline"}
          size="sm"
          onClick={() => onChange(range.days)}
          className={cn("text-xs")}
        >
          {range.label}
        </Button>
      ))}
    </div>
  );
}

export function getDaysAgoISO(days: number): string | undefined {
  if (days === 0) return undefined;
  const date = new Date();
  date.setDate(date.getDate() - days);
  date.setHours(0, 0, 0, 0);
  return date.toISOString();
}
