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
import { Plus, Trash2 } from "lucide-react";
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
  const [productNameContains, setProductNameContains] = useState("");
  const [adding, setAdding] = useState(false);

  async function handleAddRule() {
    if (!brandName && !category && !strain && !strainType && !productNameContains) {
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
          productNameContains: productNameContains || null,
        }),
      });
      if (!res.ok) throw new Error("Failed to add rule");
      toast.success("Rule added");
      setBrandName("");
      setCategory("");
      setStrain("");
      setStrainType("");
      setProductNameContains("");
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
                {rule.productNameContains && (
                  <span className="bg-background rounded px-1.5 py-0.5">
                    Name contains: {rule.productNameContains}
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
        <Select value={brandName} onValueChange={setBrandName}>
          <SelectTrigger className="text-xs h-8">
            <SelectValue placeholder="Brand..." />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="">Any Brand</SelectItem>
            {brands.map((b) => (
              <SelectItem key={b} value={b}>
                {b}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={category} onValueChange={setCategory}>
          <SelectTrigger className="text-xs h-8">
            <SelectValue placeholder="Category..." />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="">Any Category</SelectItem>
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

        <Select value={strainType} onValueChange={setStrainType}>
          <SelectTrigger className="text-xs h-8">
            <SelectValue placeholder="Strain type..." />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="">Any Type</SelectItem>
            {STRAIN_TYPES.map((t) => (
              <SelectItem key={t} value={t}>
                {t}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Input
          placeholder="Product name contains..."
          className="text-xs h-8 col-span-2"
          value={productNameContains}
          onChange={(e) => setProductNameContains(e.target.value)}
        />
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
