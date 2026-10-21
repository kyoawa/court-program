"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
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
import { Plus, Trash2, X, Eye, Loader2, Pencil, Check, Play, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { useStrains } from "@/hooks/use-strains";
import type { MatchingRule } from "@/lib/types";
import type { PreviewMatch } from "@/app/api/repository/images/[id]/preview/route";

interface ImagePreview {
  imageId: number;
  matchCount: number;
  excludedCount: number;
  applyCount: number;
  missingCount: number;
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
  /** Called after an apply finishes so counts can refresh. */
  onApplied?: () => void;
}

const STRAIN_TYPES = ["Indica", "Sativa", "Hybrid", "Indica Dominant Hybrid", "Sativa Dominant Hybrid"];
const ANY = "__any__";

const KEYWORD_HELP =
  'Every keyword must match the product name. Use -word to exclude (e.g. -5pk), "quotes" for a phrase, and /regex/ for patterns. Press Enter to add each one.';

const EMPTY_FORM = { brandName: "", category: "", strain: "", strainType: "", keywords: [] as string[], priority: "" };

function ruleToForm(rule: MatchingRule) {
  return {
    brandName: rule.brandName ?? "",
    category: rule.category ?? "",
    strain: rule.strain ?? "",
    strainType: rule.strainType ?? "",
    keywords: rule.productNameKeywords ?? [],
    priority: String(rule.priority ?? ""),
  };
}

function autoPriority(form: typeof EMPTY_FORM): number {
  return [form.brandName, form.category, form.strain, form.strainType].filter(Boolean).length + (form.keywords.length ? 1 : 0);
}

export function RuleEditor({ imageId, rules, excludedProductIds, brands, categories, onChanged, onApplied }: RuleEditorProps) {
  const { strains } = useStrains();
  const [form, setForm] = useState(EMPTY_FORM);
  const [keywordInput, setKeywordInput] = useState("");
  const [editingRuleId, setEditingRuleId] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [preview, setPreview] = useState<ImagePreview | null>(null);
  const [missingOnly, setMissingOnly] = useState(true);
  const [applying, setApplying] = useState(false);
  const [overwriteExisting, setOverwriteExisting] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });

  const localExclusionsRef = useRef<Set<number>>(new Set(excludedProductIds));
  const exclusionSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    localExclusionsRef.current = new Set(excludedProductIds);
  }, [excludedProductIds]);

  const strainOptions = useMemo(() => {
    const list = [...strains];
    if (form.strain && !list.includes(form.strain)) list.unshift(form.strain);
    return list;
  }, [strains, form.strain]);

  function addKeyword() {
    const kw = keywordInput.trim();
    if (kw && !form.keywords.includes(kw)) setForm({ ...form, keywords: [...form.keywords, kw] });
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

  const isFormEmpty = !form.brandName && !form.category && !form.strain && !form.strainType && form.keywords.length === 0;

  async function handleSubmitRule() {
    if (isFormEmpty) { toast.error("Set at least one filter field"); return; }
    setSubmitting(true);
    try {
      const url = editingRuleId ? `/api/repository/rules/${editingRuleId}` : "/api/repository/rules";
      const body: Record<string, unknown> = {
        brandName: form.brandName || null,
        category: form.category || null,
        strain: form.strain || null,
        strainType: form.strainType || null,
        productNameKeywords: form.keywords.length > 0 ? form.keywords : null,
      };
      if (form.priority.trim() !== "" && Number.isFinite(Number(form.priority))) body.priority = Number(form.priority);
      if (!editingRuleId) body.imageId = imageId;
      const res = await fetch(url, { method: editingRuleId ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `Failed to ${editingRuleId ? "update" : "add"} rule`);
      }
      toast.success(editingRuleId ? "Rule updated" : "Rule added");
      resetForm();
      onChanged();
      if (preview) await loadPreview();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save rule");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDeleteRule(ruleId: number) {
    try {
      const res = await fetch(`/api/repository/rules/${ruleId}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete");
      toast.success("Rule removed");
      if (editingRuleId === ruleId) resetForm();
      onChanged();
      if (preview) await loadPreview();
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
          method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ excludedProductIds: ids }),
        });
        if (!res.ok) throw new Error("Failed to save");
        onChanged();
      } catch {
        toast.error("Failed to save exclusions");
      }
    }, 300);
  }

  function recompute(matches: PreviewMatch[], base: ImagePreview): ImagePreview {
    const excludedCount = matches.filter((m) => m.excluded).length;
    const applicable = matches.filter((m) => !m.excluded && !m.alreadyApplied);
    return { ...base, matches, excludedCount, applyCount: applicable.length, missingCount: applicable.filter((m) => m.imageCount === 0).length, excludedProductIds: Array.from(localExclusionsRef.current) };
  }

  function toggleExclusion(productId: number, currentlyIncluded: boolean) {
    if (!preview) return;
    const next = new Set(localExclusionsRef.current);
    if (currentlyIncluded) next.add(productId); else next.delete(productId);
    localExclusionsRef.current = next;
    setPreview(recompute(preview.matches.map((m) => (m.productId === productId ? { ...m, excluded: !currentlyIncluded } : m)), preview));
    commitExclusions(Array.from(next));
  }

  async function resetExclusions() {
    if (!preview) return;
    localExclusionsRef.current = new Set();
    setPreview(recompute(preview.matches.map((m) => ({ ...m, excluded: false })), preview));
    try {
      const res = await fetch(`/api/repository/images/${imageId}/exclusions`, {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ excludedProductIds: [] }),
      });
      if (!res.ok) throw new Error();
      toast.success("Exclusions cleared");
      onChanged();
    } catch {
      toast.error("Failed to clear exclusions");
    }
  }

  /** What Apply will actually touch: not excluded, not already carrying this image, missing unless overwriting. */
  const applyTargets = useMemo(
    () => (preview?.matches ?? []).filter((m) => !m.excluded && !m.alreadyApplied && (overwriteExisting || m.imageCount === 0)),
    [preview, overwriteExisting]
  );
  const visibleMatches = useMemo(
    () => (preview?.matches ?? []).filter((m) => !missingOnly || m.imageCount === 0 || m.alreadyApplied),
    [preview, missingOnly]
  );
  const shadowedCount = (preview?.matches ?? []).filter((m) => !m.excluded && m.winnerImageId !== null && m.winnerImageId !== imageId).length;

  async function handleApply() {
    if (!preview || applyTargets.length === 0 || rules.length === 0) return;
    setApplying(true);
    setProgress({ done: 0, total: applyTargets.length });
    try {
      const res = await fetch(`/api/repository/images/${imageId}/apply`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ overwriteExisting, productIds: applyTargets.map((m) => m.productId) }),
      });
      if (!res.ok || !res.body) {
        const errBody = await res.json().catch(() => ({}));
        throw new Error(errBody.error || "Failed to apply");
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let success = 0, failed = 0, unmanaged = 0;
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
            if (event.type === "success") { success++; unmanaged += Number(event.unmanagedCount ?? 0); setProgress((p) => ({ ...p, done: p.done + 1 })); }
            else if (event.type === "error") { failed++; setProgress((p) => ({ ...p, done: p.done + 1 })); }
          } catch { /* skip */ }
        }
      }
      const parts = [`Applied to ${success} / ${applyTargets.length} products.`];
      if (overwriteExisting && unmanaged > 0) parts.push(`${unmanaged} unmanaged image(s) left in place.`);
      if (failed > 0) parts.push(`${failed} failed.`);
      (failed > 0 ? toast.error : toast.success)(parts.join(" "));
      onApplied?.();
      onChanged();
      await loadPreview();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to apply");
    } finally {
      setApplying(false);
    }
  }

  const progressPct = progress.total > 0 ? (progress.done / progress.total) * 100 : 0;

  return (
    <div className="space-y-3">
      <h4 className="text-sm font-medium">Matching Rules</h4>

      {rules.length > 0 && (
        <div className="space-y-1">
          {rules.map((rule) => {
            const isEditing = editingRuleId === rule.id;
            return (
              <div key={rule.id} className={`flex items-center gap-2 text-xs rounded-md px-2 py-1.5 ${isEditing ? "bg-amber-100 ring-1 ring-amber-400" : "bg-muted hover:bg-muted/70 transition-colors"}`}>
                <span className="flex-1 flex flex-wrap gap-1">
                  {rule.brandName && <span className="bg-background rounded px-1.5 py-0.5">Brand: {rule.brandName}</span>}
                  {rule.category && <span className="bg-background rounded px-1.5 py-0.5">Category: {rule.category}</span>}
                  {rule.strain && <span className="bg-background rounded px-1.5 py-0.5">Strain: {rule.strain}</span>}
                  {rule.strainType && <span className="bg-background rounded px-1.5 py-0.5">Type: {rule.strainType}</span>}
                  {rule.productNameKeywords && rule.productNameKeywords.length > 0 && (
                    <span className="bg-background rounded px-1.5 py-0.5">Name: {rule.productNameKeywords.join(" ")}</span>
                  )}
                  <span className="text-muted-foreground px-1 py-0.5" title="Priority: higher wins when several images match">p{rule.priority}</span>
                </span>
                <Button variant="ghost" size="sm" className="h-6 w-6 p-0" title={isEditing ? "Cancel edit" : "Edit rule"} onClick={() => (isEditing ? resetForm() : startEdit(rule))}>
                  {isEditing ? <X className="h-3 w-3" /> : <Pencil className="h-3 w-3" />}
                </Button>
                <Button variant="ghost" size="sm" className="h-6 w-6 p-0" title="Delete rule" onClick={() => handleDeleteRule(rule.id)}>
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>
            );
          })}
        </div>
      )}

      <div className="grid grid-cols-2 gap-2">
        <Select value={form.brandName || ANY} onValueChange={(v) => setForm({ ...form, brandName: v === ANY ? "" : v })}>
          <SelectTrigger className="text-xs h-8"><SelectValue placeholder="Brand..." /></SelectTrigger>
          <SelectContent>
            <SelectItem value={ANY}>Any Brand</SelectItem>
            {brands.map((b) => <SelectItem key={b} value={b}>{b}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={form.category || ANY} onValueChange={(v) => setForm({ ...form, category: v === ANY ? "" : v })}>
          <SelectTrigger className="text-xs h-8"><SelectValue placeholder="Category..." /></SelectTrigger>
          <SelectContent>
            <SelectItem value={ANY}>Any Category</SelectItem>
            {categories.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={form.strain || ANY} onValueChange={(v) => setForm({ ...form, strain: v === ANY ? "" : v })}>
          <SelectTrigger className="text-xs h-8"><SelectValue placeholder="Strain..." /></SelectTrigger>
          <SelectContent>
            <SelectItem value={ANY}>Any Strain</SelectItem>
            {strainOptions.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={form.strainType || ANY} onValueChange={(v) => setForm({ ...form, strainType: v === ANY ? "" : v })}>
          <SelectTrigger className="text-xs h-8"><SelectValue placeholder="Strain type..." /></SelectTrigger>
          <SelectContent>
            <SelectItem value={ANY}>Any Type</SelectItem>
            {STRAIN_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
          </SelectContent>
        </Select>

        <div className="col-span-2 space-y-1">
          {form.keywords.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {form.keywords.map((kw, i) => (
                <span key={i} className={`inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-xs ${kw.startsWith("-") ? "bg-destructive/10 text-destructive" : "bg-primary/10 text-primary"}`}>
                  {kw}
                  <button type="button" className="hover:opacity-70" onClick={() => setForm({ ...form, keywords: form.keywords.filter((_, j) => j !== i) })}>
                    <X className="h-3 w-3" />
                  </button>
                </span>
              ))}
            </div>
          )}
          <Input
            placeholder='Name keyword: og kush, -5pk, "1g 5pk", /regex/ — Enter to add'
            className="text-xs h-8"
            value={keywordInput}
            title={KEYWORD_HELP}
            onChange={(e) => setKeywordInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && keywordInput.trim()) { e.preventDefault(); addKeyword(); }
            }}
          />
          <p className="text-[11px] text-muted-foreground">{KEYWORD_HELP}</p>
        </div>

        <div className="col-span-2 flex items-center gap-2 text-xs">
          <span className="text-muted-foreground">Priority</span>
          <Input
            type="number"
            className="w-20 h-8 text-xs"
            placeholder={String(autoPriority(form))}
            value={form.priority}
            onChange={(e) => setForm({ ...form, priority: e.target.value })}
            title="Higher wins when several images match a product. Blank uses the number of fields set."
          />
          <span className="text-muted-foreground">higher wins when several images match (blank = {autoPriority(form)})</span>
        </div>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <Button variant="outline" size="sm" onClick={handleSubmitRule} disabled={submitting}>
          {editingRuleId ? <Check className="h-3 w-3 mr-1" /> : <Plus className="h-3 w-3 mr-1" />}
          {editingRuleId ? "Save Rule" : "Add Rule"}
        </Button>
        {editingRuleId && <Button variant="ghost" size="sm" onClick={resetForm}>Cancel</Button>}
        <Button variant="ghost" size="sm" onClick={loadPreview} disabled={previewing || rules.length === 0} title={rules.length === 0 ? "Add a rule first" : undefined}>
          {previewing ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <Eye className="h-3 w-3 mr-1" />}
          Preview Matches
        </Button>
      </div>

      {preview && (
        <div className="rounded-md border bg-muted/30">
          <div className="sticky top-0 bg-muted/80 backdrop-blur px-3 py-2 flex items-center justify-between gap-2 border-b text-xs flex-wrap">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-medium">{preview.matchCount} product{preview.matchCount !== 1 ? "s" : ""} match</span>
              <Badge variant="secondary" className="text-[10px]">{preview.missingCount} missing images</Badge>
              {preview.excludedCount > 0 && <Badge variant="secondary" className="text-[10px]">{preview.excludedCount} excluded</Badge>}
              {preview.matches.some((m) => m.alreadyApplied) && (
                <Badge variant="secondary" className="text-[10px]">{preview.matches.filter((m) => m.alreadyApplied).length} already have this image</Badge>
              )}
              {shadowedCount > 0 && (
                <Badge variant="outline" className="text-[10px] border-amber-400 text-amber-700" title="Another image's rule wins for these products">
                  {shadowedCount} go to another image
                </Badge>
              )}
            </div>
            <div className="flex items-center gap-3">
              <label className="flex items-center gap-1"><Checkbox checked={missingOnly} onCheckedChange={(v) => setMissingOnly(v === true)} />Missing images only</label>
              {preview.excludedCount > 0 && (
                <button type="button" className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1" onClick={resetExclusions}>
                  <RotateCcw className="h-3 w-3" />Reset exclusions
                </button>
              )}
              <button type="button" className="text-muted-foreground hover:text-foreground" onClick={() => setPreview(null)}>Close</button>
            </div>
          </div>
          <div className="max-h-80 overflow-y-auto">
            {visibleMatches.length === 0 ? (
              <p className="text-xs text-muted-foreground p-3">
                {preview.matches.length === 0 ? "No products match these rules." : "Every matching product already has images. Turn off “Missing images only” to see them."}
              </p>
            ) : (
              <ul className="divide-y">
                {visibleMatches.map((m) => {
                  const included = !m.excluded;
                  const shadowed = m.winnerImageId !== null && m.winnerImageId !== imageId;
                  return (
                    <li key={m.productId} className="flex items-center gap-2 px-3 py-1.5 text-xs">
                      <Checkbox checked={included} onCheckedChange={() => toggleExclusion(m.productId, included)} />
                      <span className={`flex-1 truncate ${m.excluded ? "line-through text-muted-foreground" : ""}`}>{m.productName ?? "Unknown"}</span>
                      {m.brandName && <span className="text-muted-foreground hidden sm:inline truncate max-w-[120px]">{m.brandName}</span>}
                      {m.category && <Badge variant="secondary" className="text-[10px]">{m.category}</Badge>}
                      {m.alreadyApplied ? (
                        <Badge variant="outline" className="text-[10px]">has this image</Badge>
                      ) : m.imageCount > 0 ? (
                        <Badge variant="outline" className="text-[10px]">{m.imageCount} image{m.imageCount !== 1 ? "s" : ""}</Badge>
                      ) : (
                        <Badge variant="destructive" className="text-[10px]">no image</Badge>
                      )}
                      {shadowed && !m.excluded && (
                        <Badge variant="outline" className="text-[10px] border-amber-400 text-amber-700" title="A higher-priority rule on another image wins for this product">
                          → {m.winnerImageName ?? `image ${m.winnerImageId}`}
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

      {applying && <Progress value={progressPct} className="h-2" />}

      <div className="flex items-center gap-3 flex-wrap pt-1">
        <Button
          size="sm"
          className="bg-amber-500 hover:bg-amber-600 text-white"
          onClick={handleApply}
          disabled={applying || rules.length === 0 || !preview || applyTargets.length === 0}
          title={rules.length === 0 ? "Add a rule first" : !preview ? "Run Preview Matches first" : applyTargets.length === 0 ? "Nothing to apply" : undefined}
        >
          {applying ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <Play className="h-3 w-3 mr-1" />}
          {applying ? `Applying... ${progress.done}/${progress.total}` : preview ? `Apply to ${applyTargets.length} product${applyTargets.length !== 1 ? "s" : ""}` : "Apply"}
        </Button>
        <label className="flex items-center gap-2 text-xs">
          <Checkbox checked={overwriteExisting} onCheckedChange={(v) => setOverwriteExisting(v === true)} disabled={applying} />
          <span>Overwrite existing images</span>
        </label>
        {preview && !overwriteExisting && (
          <span className="text-[11px] text-muted-foreground">Only products with no images are applied unless Overwrite is on.</span>
        )}
      </div>
    </div>
  );
}
