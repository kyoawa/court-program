"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Plus,
  Trash2,
  X,
  Eye,
  Loader2,
  Pencil,
  Check,
  Play,
  RotateCcw,
} from "lucide-react";
import { toast } from "sonner";
import type { MatchingRule } from "@/lib/types";

interface PreviewMatch {
  productId: number;
  productName: string | null;
  brandName: string | null;
  category: string | null;
  strain: string | null;
  strainType: string | null;
  excluded: boolean;
}

interface ImagePreview {
  imageId: number;
  matchCount: number;
  excludedCount: number;
  applyCount: number;
  excludedProductIds: number[];
  matches: PreviewMatch[];
}

interface RuleEditorProps {
  imageId: number;
  rules: MatchingRule[];
  excludedProductIds: number[];
  brands: string[];
  categories: string[];
  onChanged: () => void;
}

const STRAIN_TYPES = [
  "Indica",
  "Sativa",
  "Hybrid",
  "Indica Dominant Hybrid",
  "Sativa Dominant Hybrid",
];

const EMPTY_FORM = {
  brandName: "",
  category: "",
  strain: "",
  strainType: "",
  keywords: [] as string[],
};

function ruleToForm(rule: MatchingRule) {
  return {
    brandName: rule.brandName ?? "",
    category: rule.category ?? "",
    strain: rule.strain ?? "",
    strainType: rule.strainType ?? "",
    keywords: rule.productNameKeywords ?? [],
  };
}

export function RuleEditor({
  imageId,
  rules,
  excludedProductIds,
  brands,
  categories,
  onChanged,
}: RuleEditorProps) {
  const [form, setForm] = useState(EMPTY_FORM);
  const [keywordInput, setKeywordInput] = useState("");
  const [editingRuleId, setEditingRuleId] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [preview, setPreview] = useState<ImagePreview | null>(null);
  const [applying, setApplying] = useState(false);
  const [overwriteExisting, setOverwriteExisting] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });

  const localExclusionsRef = useRef<Set<number>>(new Set(excludedProductIds));
  const exclusionSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    localExclusionsRef.current = new Set(excludedProductIds);
  }, [excludedProductIds]);

  function addKeyword() {
    const kw = keywordInput.trim();
    if (kw && !form.keywords.includes(kw)) {
      setForm({ ...form, keywords: [...form.keywords, kw] });
    }
    setKeywordInput("");
  }

  function resetForm() {
    setForm(EMPTY_FORM);
    setKeywordInput("");
    setEditingRuleId(null);
  }

  function startEdit(rule: MatchingRule) {
    setForm(ruleToForm(rule));
    setKeywordInput("");
    setEditingRuleId(rule.id);
  }

  function isFormEmpty() {
    return (
      !form.brandName &&
      !form.category &&
      !form.strain &&
      !form.strainType &&
      form.keywords.length === 0
    );
  }

  async function handleSubmitRule() {
    if (isFormEmpty()) {
      toast.error("Set at least one filter field");
      return;
    }

    setSubmitting(true);
    try {
      const url = editingRuleId
        ? `/api/repository/rules/${editingRuleId}`
        : "/api/repository/rules";
      const method = editingRuleId ? "PATCH" : "POST";
      const body: Record<string, unknown> = {
        brandName: form.brandName || null,
        category: form.category || null,
        strain: form.strain || null,
        strainType: form.strainType || null,
        productNameKeywords: form.keywords.length > 0 ? form.keywords : null,
      };
      if (!editingRuleId) body.imageId = imageId;

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `Failed to ${editingRuleId ? "update" : "add"} rule`);
      }
      toast.success(editingRuleId ? "Rule updated" : "Rule added");
      resetForm();
      onChanged();
      // refresh preview if open
      if (preview) {
        await loadPreview();
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save rule");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDeleteRule(ruleId: number) {
    try {
      const res = await fetch(`/api/repository/rules/${ruleId}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Failed to delete");
      toast.success("Rule removed");
      if (editingRuleId === ruleId) resetForm();
      onChanged();
      if (preview) {
        await loadPreview();
      }
    } catch {
      toast.error("Failed to remove rule");
    }
  }

  const loadPreview = useCallback(async () => {
    setPreviewing(true);
    try {
      const res = await fetch(`/api/repository/images/${imageId}/preview`);
      if (!res.ok) throw new Error("Preview failed");
      const data = (await res.json()) as ImagePreview;
      setPreview(data);
      localExclusionsRef.current = new Set(data.excludedProductIds);
    } catch {
      toast.error("Failed to load preview");
    } finally {
      setPreviewing(false);
    }
  }, [imageId]);

  function commitExclusions(ids: number[]) {
    if (exclusionSaveTimer.current) clearTimeout(exclusionSaveTimer.current);
    exclusionSaveTimer.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/repository/images/${imageId}/exclusions`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ excludedProductIds: ids }),
        });
        if (!res.ok) throw new Error("Failed to save");
        onChanged();
      } catch {
        toast.error("Failed to save exclusions");
      }
    }, 300);
  }

  function toggleExclusion(productId: number, currentlyIncluded: boolean) {
    if (!preview) return;
    const next = new Set(localExclusionsRef.current);
    if (currentlyIncluded) {
      next.add(productId);
    } else {
      next.delete(productId);
    }
    localExclusionsRef.current = next;
    const updatedMatches = preview.matches.map((m) =>
      m.productId === productId ? { ...m, excluded: !currentlyIncluded } : m
    );
    const excludedCount = updatedMatches.filter((m) => m.excluded).length;
    setPreview({
      ...preview,
      matches: updatedMatches,
      excludedProductIds: Array.from(next),
      excludedCount,
      applyCount: preview.matchCount - excludedCount,
    });
    commitExclusions(Array.from(next));
  }

  async function resetExclusions() {
    if (!preview) return;
    localExclusionsRef.current = new Set();
    const updatedMatches = preview.matches.map((m) => ({ ...m, excluded: false }));
    setPreview({
      ...preview,
      matches: updatedMatches,
      excludedProductIds: [],
      excludedCount: 0,
      applyCount: preview.matchCount,
    });
    try {
      const res = await fetch(`/api/repository/images/${imageId}/exclusions`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ excludedProductIds: [] }),
      });
      if (!res.ok) throw new Error();
      toast.success("Exclusions cleared");
      onChanged();
    } catch {
      toast.error("Failed to clear exclusions");
    }
  }

  async function handleApply() {
    if (!preview || preview.applyCount === 0 || rules.length === 0) return;

    setApplying(true);
    setProgress({ done: 0, total: preview.applyCount });

    try {
      const res = await fetch(`/api/repository/images/${imageId}/apply`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ overwriteExisting }),
      });

      if (!res.ok || !res.body) {
        const errBody = await res.json().catch(() => ({}));
        throw new Error(errBody.error || "Failed to apply");
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let success = 0;
      let failed = 0;
      let unmanaged = 0;

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
              if (typeof event.unmanagedCount === "number") {
                unmanaged += event.unmanagedCount;
              }
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

      const parts = [
        `Applied to ${success} / ${preview.applyCount} products.`,
      ];
      if (overwriteExisting && unmanaged > 0) {
        parts.push(`${unmanaged} unmanaged skipped.`);
      }
      if (failed > 0) parts.push(`${failed} failed.`);
      toast.success(parts.join(" "));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to apply");
    } finally {
      setApplying(false);
    }
  }

  const previewPct =
    progress.total > 0 ? (progress.done / progress.total) * 100 : 0;

  return (
    <div className="space-y-3">
      <h4 className="text-sm font-medium">Matching Rules</h4>

      {rules.length > 0 && (
        <div className="space-y-1">
          {rules.map((rule) => {
            const isEditing = editingRuleId === rule.id;
            return (
              <div
                key={rule.id}
                className={`flex items-center gap-2 text-xs rounded-md px-2 py-1.5 ${
                  isEditing
                    ? "bg-amber-100 ring-1 ring-amber-400"
                    : "bg-muted hover:bg-muted/70 transition-colors"
                }`}
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
                  title={isEditing ? "Cancel edit" : "Edit rule"}
                  onClick={() => (isEditing ? resetForm() : startEdit(rule))}
                >
                  {isEditing ? <X className="h-3 w-3" /> : <Pencil className="h-3 w-3" />}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 w-6 p-0"
                  title="Delete rule"
                  onClick={() => handleDeleteRule(rule.id)}
                >
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>
            );
          })}
        </div>
      )}

      <div className="grid grid-cols-2 gap-2">
        <Select
          value={form.brandName || "__any__"}
          onValueChange={(v) =>
            setForm({ ...form, brandName: v === "__any__" ? "" : v })
          }
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
          value={form.category || "__any__"}
          onValueChange={(v) =>
            setForm({ ...form, category: v === "__any__" ? "" : v })
          }
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
          value={form.strain}
          onChange={(e) => setForm({ ...form, strain: e.target.value })}
        />

        <Select
          value={form.strainType || "__any__"}
          onValueChange={(v) =>
            setForm({ ...form, strainType: v === "__any__" ? "" : v })
          }
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
          {form.keywords.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {form.keywords.map((kw, i) => (
                <span
                  key={i}
                  className="inline-flex items-center gap-0.5 bg-primary/10 text-primary rounded px-1.5 py-0.5 text-xs"
                >
                  {kw}
                  <button
                    type="button"
                    className="hover:text-destructive"
                    onClick={() =>
                      setForm({
                        ...form,
                        keywords: form.keywords.filter((_, j) => j !== i),
                      })
                    }
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

      <div className="flex items-center gap-2 flex-wrap">
        <Button
          variant="outline"
          size="sm"
          onClick={handleSubmitRule}
          disabled={submitting}
        >
          {editingRuleId ? (
            <Check className="h-3 w-3 mr-1" />
          ) : (
            <Plus className="h-3 w-3 mr-1" />
          )}
          {editingRuleId ? "Save Rule" : "Add Rule"}
        </Button>
        {editingRuleId && (
          <Button variant="ghost" size="sm" onClick={resetForm}>
            Cancel
          </Button>
        )}
        <Button
          variant="ghost"
          size="sm"
          onClick={loadPreview}
          disabled={previewing || rules.length === 0}
          title={rules.length === 0 ? "Add a rule first" : undefined}
        >
          {previewing ? (
            <Loader2 className="h-3 w-3 mr-1 animate-spin" />
          ) : (
            <Eye className="h-3 w-3 mr-1" />
          )}
          Preview Matches
        </Button>
      </div>

      {preview && (
        <div className="rounded-md border bg-muted/30">
          <div className="sticky top-0 bg-muted/80 backdrop-blur px-3 py-2 flex items-center justify-between border-b text-xs">
            <div className="flex items-center gap-2">
              <span className="font-medium">
                {preview.matchCount} product{preview.matchCount !== 1 ? "s" : ""} match
              </span>
              {preview.excludedCount > 0 && (
                <Badge variant="secondary" className="text-[10px]">
                  {preview.excludedCount} excluded · {preview.applyCount} will apply
                </Badge>
              )}
            </div>
            <div className="flex items-center gap-3">
              {preview.excludedCount > 0 && (
                <button
                  type="button"
                  className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
                  onClick={resetExclusions}
                >
                  <RotateCcw className="h-3 w-3" />
                  Reset exclusions
                </button>
              )}
              <button
                type="button"
                className="text-xs text-muted-foreground hover:text-foreground"
                onClick={() => setPreview(null)}
              >
                Close
              </button>
            </div>
          </div>
          <div className="max-h-80 overflow-y-auto">
            {preview.matches.length === 0 ? (
              <p className="text-xs text-muted-foreground p-3">
                No products match these rules.
              </p>
            ) : (
              <ul className="divide-y">
                {preview.matches.map((m) => {
                  const included = !m.excluded;
                  return (
                    <li
                      key={m.productId}
                      className="flex items-center gap-2 px-3 py-1.5 text-xs"
                    >
                      <Checkbox
                        checked={included}
                        onCheckedChange={() =>
                          toggleExclusion(m.productId, included)
                        }
                      />
                      <span
                        className={`flex-1 truncate ${
                          m.excluded ? "line-through text-muted-foreground" : ""
                        }`}
                      >
                        {m.productName ?? "Unknown"}
                      </span>
                      {m.brandName && (
                        <span className="text-muted-foreground hidden sm:inline truncate max-w-[120px]">
                          {m.brandName}
                        </span>
                      )}
                      {m.category && (
                        <Badge variant="secondary" className="text-[10px]">
                          {m.category}
                        </Badge>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      )}

      {applying && <Progress value={previewPct} className="h-2" />}

      <div className="flex items-center gap-3 flex-wrap pt-1">
        <Button
          size="sm"
          className="bg-amber-500 hover:bg-amber-600 text-white"
          onClick={handleApply}
          disabled={
            applying ||
            rules.length === 0 ||
            !preview ||
            preview.applyCount === 0
          }
          title={
            rules.length === 0
              ? "Add a rule first"
              : !preview
                ? "Run Preview Matches first"
                : preview.applyCount === 0
                  ? "No products to apply"
                  : undefined
          }
        >
          {applying ? (
            <Loader2 className="h-3 w-3 mr-1 animate-spin" />
          ) : (
            <Play className="h-3 w-3 mr-1" />
          )}
          {applying
            ? `Applying... ${progress.done}/${progress.total}`
            : preview
              ? `Apply to ${preview.applyCount} product${preview.applyCount !== 1 ? "s" : ""}`
              : "Apply"}
        </Button>
        <label className="flex items-center gap-2 text-xs">
          <Checkbox
            checked={overwriteExisting}
            onCheckedChange={(v) => setOverwriteExisting(v === true)}
            disabled={applying}
          />
          <span>Overwrite existing images</span>
        </label>
      </div>
    </div>
  );
}
