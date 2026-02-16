"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plus, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import type { MatchingRule } from "@/lib/types";

interface RuleEditorProps {
  imageId: number;
  rules: MatchingRule[];
  brands: string[];
  categories: string[];
  onChanged: () => void;
}

const STRAIN_TYPES = ["Indica", "Sativa", "Hybrid", "Indica Dominant Hybrid", "Sativa Dominant Hybrid"];

export function RuleEditor({
  imageId,
  rules,
  brands,
  categories,
  onChanged,
}: RuleEditorProps) {
  const [brandName, setBrandName] = useState("");
  const [category, setCategory] = useState("");
  const [strain, setStrain] = useState("");
  const [strainType, setStrainType] = useState("");
  const [keywords, setKeywords] = useState<string[]>([]);
  const [keywordInput, setKeywordInput] = useState("");
  const [adding, setAdding] = useState(false);

  function addKeyword() {
    const kw = keywordInput.trim();
    if (kw && !keywords.includes(kw)) {
      setKeywords([...keywords, kw]);
    }
    setKeywordInput("");
  }

  async function handleAddRule() {
    if (!brandName && !category && !strain && !strainType && keywords.length === 0) {
      toast.error("Set at least one filter field");
      return;
    }

    setAdding(true);
    try {
      const res = await fetch("/api/repository/rules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          imageId,
          brandName: brandName || null,
          category: category || null,
          strain: strain || null,
          strainType: strainType || null,
          productNameKeywords: keywords.length > 0 ? keywords : null,
        }),
      });
      if (!res.ok) throw new Error("Failed to add rule");
      toast.success("Rule added");
      setBrandName("");
      setCategory("");
      setStrain("");
      setStrainType("");
      setKeywords([]);
      setKeywordInput("");
      onChanged();
    } catch {
      toast.error("Failed to add rule");
    } finally {
      setAdding(false);
    }
  }

  async function handleDeleteRule(ruleId: number) {
    try {
      const res = await fetch(`/api/repository/rules/${ruleId}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Failed to delete");
      toast.success("Rule removed");
      onChanged();
    } catch {
      toast.error("Failed to remove rule");
    }
  }

  return (
    <div className="space-y-3">
      <h4 className="text-sm font-medium">Matching Rules</h4>

      {rules.length > 0 && (
        <div className="space-y-1">
          {rules.map((rule) => (
            <div
              key={rule.id}
              className="flex items-center gap-2 text-xs bg-muted rounded-md px-2 py-1.5"
            >
              <span className="flex-1 flex flex-wrap gap-1">
                {rule.brandName && (
                  <span className="bg-background rounded px-1.5 py-0.5">
                    Brand: {rule.brandName}
                  </span>
                )}
                {rule.category && (
                  <span className="bg-background rounded px-1.5 py-0.5">
                    Category: {rule.category}
                  </span>
                )}
                {rule.strain && (
                  <span className="bg-background rounded px-1.5 py-0.5">
                    Strain: {rule.strain}
                  </span>
                )}
                {rule.strainType && (
                  <span className="bg-background rounded px-1.5 py-0.5">
                    Type: {rule.strainType}
                  </span>
                )}
                {rule.productNameKeywords && rule.productNameKeywords.length > 0 && (
                  <span className="bg-background rounded px-1.5 py-0.5">
                    Name contains: {rule.productNameKeywords.join(" AND ")}
                  </span>
                )}
              </span>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 w-6 p-0"
                onClick={() => handleDeleteRule(rule.id)}
              >
                <Trash2 className="h-3 w-3" />
              </Button>
            </div>
          ))}
        </div>
      )}

      <div className="grid grid-cols-2 gap-2">
        <Select
          value={brandName || "__any__"}
          onValueChange={(v) => setBrandName(v === "__any__" ? "" : v)}
        >
          <SelectTrigger className="text-xs h-8">
            <SelectValue placeholder="Brand..." />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__any__">Any Brand</SelectItem>
            {brands.map((b) => (
              <SelectItem key={b} value={b}>
                {b}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={category || "__any__"}
          onValueChange={(v) => setCategory(v === "__any__" ? "" : v)}
        >
          <SelectTrigger className="text-xs h-8">
            <SelectValue placeholder="Category..." />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__any__">Any Category</SelectItem>
            {categories.map((c) => (
              <SelectItem key={c} value={c}>
                {c}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Input
          placeholder="Strain..."
          className="text-xs h-8"
          value={strain}
          onChange={(e) => setStrain(e.target.value)}
        />

        <Select
          value={strainType || "__any__"}
          onValueChange={(v) => setStrainType(v === "__any__" ? "" : v)}
        >
          <SelectTrigger className="text-xs h-8">
            <SelectValue placeholder="Strain type..." />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__any__">Any Type</SelectItem>
            {STRAIN_TYPES.map((t) => (
              <SelectItem key={t} value={t}>
                {t}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="col-span-2 space-y-1">
          {keywords.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {keywords.map((kw, i) => (
                <span
                  key={i}
                  className="inline-flex items-center gap-0.5 bg-primary/10 text-primary rounded px-1.5 py-0.5 text-xs"
                >
                  {kw}
                  <button
                    type="button"
                    className="hover:text-destructive"
                    onClick={() => setKeywords(keywords.filter((_, j) => j !== i))}
                  >
                    <X className="h-3 w-3" />
                  </button>
                </span>
              ))}
            </div>
          )}
          <Input
            placeholder="Product name keyword, press Enter to add..."
            className="text-xs h-8"
            value={keywordInput}
            onChange={(e) => setKeywordInput(e.target.value)}
            onKeyDown={(e) => {
              if ((e.key === "Enter" || e.key === ",") && keywordInput.trim()) {
                e.preventDefault();
                addKeyword();
              }
            }}
          />
        </div>
      </div>

      <Button
        variant="outline"
        size="sm"
        onClick={handleAddRule}
        disabled={adding}
      >
        <Plus className="h-3 w-3 mr-1" />
        Add Rule
      </Button>
    </div>
  );
}
