"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Plus, Trash2 } from "lucide-react";

interface UrlInputListProps {
  urls: string[];
  onChange: (urls: string[]) => void;
}

export function UrlInputList({ urls, onChange }: UrlInputListProps) {
  function addUrl() {
    onChange([...urls, ""]);
  }

  function updateUrl(index: number, value: string) {
    const next = [...urls];
    next[index] = value;
    onChange(next);
  }

  function removeUrl(index: number) {
    onChange(urls.filter((_, i) => i !== index));
  }

  return (
    <div className="space-y-3">
      {urls.length === 0 && (
        <p className="text-sm text-muted-foreground text-center py-4">
          No image URLs added yet.
        </p>
      )}
      {urls.map((url, i) => (
        <div key={i} className="flex gap-2">
          <Input
            placeholder="https://example.com/image.jpg"
            value={url}
            onChange={(e) => updateUrl(i, e.target.value)}
          />
          <Button variant="ghost" size="icon" onClick={() => removeUrl(i)}>
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      ))}
      <Button variant="outline" size="sm" onClick={addUrl}>
        <Plus className="h-4 w-4 mr-1" />
        Add URL
      </Button>
    </div>
  );
}
