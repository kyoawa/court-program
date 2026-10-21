"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRepository, useRuleConflicts } from "@/hooks/use-repository";
import { useProducts, useProductFacets } from "@/hooks/use-products";
import { UploadDialog } from "@/components/repository/upload-dialog";
import { MatchPreview } from "@/components/repository/match-preview";
import { ImageDetailDialog } from "@/components/repository/image-detail-dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { repositoryImageUrl } from "@/lib/repository-utils";
import {
  EMPTY_REPOSITORY_FILTERS,
  UNGROUPED,
  countActiveRepositoryFilters,
  filterRepositoryImages,
  type RepositoryFilters,
} from "@/lib/repository-search";
import { Trash2, ChevronDown, ChevronRight, Loader2, ImageOff, Globe, AlertTriangle, Pencil, Check, X, FolderInput, ListPlus } from "lucide-react";
import { toast } from "sonner";
import type { RepositoryImage } from "@/lib/types";

const SEARCH_HELP = 'Searches name, file name, group and rules. Use "quotes", -word, /regex/, or name:, group:, rule: to target one field.';

export default function RepositoryPage() {
  const { images, isLoading, mutate } = useRepository();
  const { products, isLoading: productsLoading } = useProducts({ isActive: true });
  const { facets } = useProductFacets({ isActive: true });
  const [filters, setFilters] = useState<RepositoryFilters>(EMPTY_REPOSITORY_FILTERS);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [detailId, setDetailId] = useState<number | null>(null);
  const [deleteTargets, setDeleteTargets] = useState<RepositoryImage[]>([]);
  const [showConflicts, setShowConflicts] = useState(false);
  const conflicts = useRuleConflicts(showConflicts);

  const brands = facets?.brands ?? [];
  const categories = facets?.categories ?? [];
  const groups = useMemo(() => Array.from(new Set(images.map((i) => i.groupName).filter((g): g is string => Boolean(g)))).sort((a, b) => a.localeCompare(b)), [images]);
  const missingImageProducts = useMemo(() => products.filter((p) => !p.imageUrl && (!p.imageUrls || p.imageUrls.length === 0)), [products]);

  const filtered = useMemo(() => filterRepositoryImages(images, filters), [images, filters]);
  const grouped = useMemo(() => {
    const map = new Map<string, RepositoryImage[]>();
    for (const image of filtered) {
      const key = image.groupName ?? UNGROUPED;
      map.set(key, [...(map.get(key) ?? []), image]);
    }
    return Array.from(map.entries()).sort(([a], [b]) => (a === UNGROUPED ? 1 : b === UNGROUPED ? -1 : a.localeCompare(b)));
  }, [filtered]);
  const detail = images.find((i) => i.id === detailId) ?? null;
  const activeFilters = countActiveRepositoryFilters(filters);

  function toggleSelect(id: number) {
    setSelected((prev) => { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  }
  function toggleGroupSelection(list: RepositoryImage[]) {
    const all = list.every((i) => selected.has(i.id));
    setSelected((prev) => { const next = new Set(prev); for (const i of list) { if (all) next.delete(i.id); else next.add(i.id); } return next; });
  }

  async function handleDelete() {
    if (!deleteTargets.length) return;
    try {
      const res = deleteTargets.length === 1
        ? await fetch(`/api/repository/images/${deleteTargets[0].id}`, { method: "DELETE" })
        : await fetch("/api/repository/images/bulk", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "delete", ids: deleteTargets.map((i) => i.id) }) });
      if (!res.ok) throw new Error("Failed to delete");
      toast.success(deleteTargets.length === 1 ? `Deleted "${deleteTargets[0].name}"` : `Deleted ${deleteTargets.length} images`);
      setSelected((prev) => { const next = new Set(prev); deleteTargets.forEach((i) => next.delete(i.id)); return next; });
      if (deleteTargets.some((i) => i.id === detailId)) setDetailId(null);
      setDeleteTargets([]);
      mutate();
    } catch {
      toast.error("Failed to delete");
    }
  }

  const appliedTotal = deleteTargets.reduce((sum, i) => sum + i.appliedCount, 0);
  const rulesTotal = deleteTargets.reduce((sum, i) => sum + i.rules.length, 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold">Image Repository</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Reusable images with rules that match them to products. Import more from{" "}
            <Link href="/brand-sources" className="underline">Brand Sources</Link>.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant={showConflicts ? "default" : "outline"} size="sm" onClick={() => setShowConflicts((v) => !v)}>
            <AlertTriangle className="h-4 w-4 mr-1" />
            {showConflicts ? (conflicts.isLoading ? "Checking…" : `${conflicts.conflicts.length} conflict${conflicts.conflicts.length === 1 ? "" : "s"}`) : "Check conflicts"}
          </Button>
          <UploadDialog onUploaded={() => mutate()} />
        </div>
      </div>

      {showConflicts && (
        <ConflictsPanel
          conflicts={conflicts.conflicts}
          imageNames={conflicts.imageNames}
          loading={conflicts.isLoading}
          onOpenImage={(id) => setDetailId(id)}
          onClose={() => setShowConflicts(false)}
        />
      )}

      <div className="space-y-2">
        <div className="flex items-center gap-2 flex-wrap">
          <Input
            placeholder="Search images, groups, rules…"
            className="w-72 h-8"
            value={filters.query}
            onChange={(e) => setFilters({ ...filters, query: e.target.value })}
            title={SEARCH_HELP}
          />
          <Select value={filters.group} onValueChange={(v) => setFilters({ ...filters, group: v })}>
            <SelectTrigger className="w-48" size="sm"><SelectValue placeholder="All groups" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All groups</SelectItem>
              <SelectItem value={UNGROUPED}>No group</SelectItem>
              {groups.map((g) => <SelectItem key={g} value={g}>{g}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={filters.rules} onValueChange={(v) => setFilters({ ...filters, rules: v as RepositoryFilters["rules"] })}>
            <SelectTrigger className="w-36" size="sm"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Any rules</SelectItem>
              <SelectItem value="has">Has rules</SelectItem>
              <SelectItem value="none">No rules</SelectItem>
            </SelectContent>
          </Select>
          <Select value={filters.applied} onValueChange={(v) => setFilters({ ...filters, applied: v as RepositoryFilters["applied"] })}>
            <SelectTrigger className="w-40" size="sm"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Applied or not</SelectItem>
              <SelectItem value="applied">Applied to products</SelectItem>
              <SelectItem value="never">Never applied</SelectItem>
            </SelectContent>
          </Select>
          <Select value={filters.origin} onValueChange={(v) => setFilters({ ...filters, origin: v as RepositoryFilters["origin"] })}>
            <SelectTrigger className="w-36" size="sm"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Any origin</SelectItem>
              <SelectItem value="imported">Imported</SelectItem>
              <SelectItem value="uploaded">Uploaded</SelectItem>
            </SelectContent>
          </Select>
          {activeFilters > 0 && (
            <Button variant="ghost" size="sm" className="h-8" onClick={() => setFilters(EMPTY_REPOSITORY_FILTERS)}>
              <X className="h-3.5 w-3.5 mr-1" />Clear {activeFilters}
            </Button>
          )}
          <span className="text-sm text-muted-foreground ml-auto">
            {isLoading ? "Loading…" : `${filtered.length} of ${images.length} images`}
          </span>
        </div>
        <p className="text-xs text-muted-foreground">{SEARCH_HELP}</p>
      </div>

      {selected.size > 0 && (
        <BulkBar
          count={selected.size}
          groups={groups}
          brands={brands}
          categories={categories}
          onClear={() => setSelected(new Set())}
          onDelete={() => setDeleteTargets(images.filter((i) => selected.has(i.id)))}
          onDone={() => { setSelected(new Set()); mutate(); }}
          ids={Array.from(selected)}
        />
      )}

      {isLoading && <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>}

      {!isLoading && images.length === 0 && (
        <div className="text-center py-12 text-muted-foreground">
          <ImageOff className="h-8 w-8 mx-auto mb-3" />
          <p>No images in the repository yet.</p>
          <p className="text-sm mt-1">Add an image, or import some from Brand Sources.</p>
        </div>
      )}

      {!isLoading && images.length > 0 && filtered.length === 0 && (
        <p className="text-sm text-muted-foreground py-6 text-center">No images match these filters.</p>
      )}

      <div className="space-y-6">
        {grouped.map(([key, list]) => {
          const name = key === UNGROUPED ? "No group" : key;
          const isCollapsed = collapsed.has(key);
          const allSelected = list.every((i) => selected.has(i.id));
          return (
            <section key={key} className="space-y-2">
              <div className="flex items-center gap-2">
                <Checkbox checked={allSelected} onCheckedChange={() => toggleGroupSelection(list)} title="Select all in group" />
                <button type="button" className="flex items-center gap-1 text-sm font-semibold" onClick={() => setCollapsed((prev) => { const next = new Set(prev); if (next.has(key)) next.delete(key); else next.add(key); return next; })}>
                  {isCollapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                  {name}
                  <span className="text-muted-foreground font-normal">({list.length})</span>
                </button>
                {key !== UNGROUPED && <GroupRename name={key} onRenamed={() => mutate()} />}
              </div>
              {!isCollapsed && (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
                  {list.map((image) => (
                    <ImageCard key={image.id} image={image} selected={selected.has(image.id)} onToggle={() => toggleSelect(image.id)} onOpen={() => setDetailId(image.id)} />
                  ))}
                </div>
              )}
            </section>
          );
        })}
      </div>

      {images.length > 0 && (
        <>
          <Separator />
          <MatchPreview products={missingImageProducts} productsLoading={productsLoading} />
        </>
      )}

      <ImageDetailDialog
        image={detail}
        groups={groups}
        brands={brands}
        categories={categories}
        onClose={() => setDetailId(null)}
        onChanged={() => mutate()}
        onDelete={(image) => setDeleteTargets([image])}
      />

      <Dialog open={deleteTargets.length > 0} onOpenChange={(open) => !open && setDeleteTargets([])}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete {deleteTargets.length === 1 ? "image" : `${deleteTargets.length} images`}</DialogTitle>
            <DialogDescription>
              {rulesTotal > 0 && `${rulesTotal} matching rule${rulesTotal !== 1 ? "s" : ""} will be deleted too. `}
              {appliedTotal > 0 && `Images already pushed to ${appliedTotal} product${appliedTotal !== 1 ? "s" : ""} stay on Dutchie. `}
              This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTargets([])}>Cancel</Button>
            <Button variant="destructive" onClick={handleDelete}>Delete</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ImageCard({ image, selected, onToggle, onOpen }: { image: RepositoryImage; selected: boolean; onToggle: () => void; onOpen: () => void }) {
  return (
    <div className={`relative rounded-md border p-2 space-y-1 ${selected ? "border-primary ring-2 ring-primary/30" : ""}`}>
      <div className="absolute top-3 left-3 z-10"><Checkbox checked={selected} onCheckedChange={onToggle} /></div>
      <button type="button" onClick={onOpen} className="block w-full aspect-square rounded overflow-hidden bg-muted">
        <img src={repositoryImageUrl(image)} alt={image.name} className="w-full h-full object-contain" loading="lazy" />
      </button>
      <button type="button" onClick={onOpen} className="block w-full text-left text-xs font-medium truncate hover:underline" title={image.name}>{image.name}</button>
      <div className="flex items-center gap-1 flex-wrap text-[10px] text-muted-foreground">
        <Badge variant={image.rules.length ? "secondary" : "outline"} className="text-[10px] px-1 py-0">{image.rules.length} rule{image.rules.length === 1 ? "" : "s"}</Badge>
        <Badge variant="outline" className="text-[10px] px-1 py-0">{image.appliedCount} applied</Badge>
        {image.sourceUrl && <Globe className="h-3 w-3" aria-label="Imported" />}
      </div>
    </div>
  );
}

function GroupRename({ name, onRenamed }: { name: string; onRenamed: () => void }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(name);
  const [saving, setSaving] = useState(false);
  async function save() {
    const to = value.trim();
    if (!to || to === name) { setEditing(false); return; }
    setSaving(true);
    try {
      const res = await fetch("/api/repository/groups", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ from: name, to }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Failed to rename");
      toast.success(`Renamed to "${to}" (${data.affected} images)`);
      setEditing(false);
      onRenamed();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to rename");
    } finally {
      setSaving(false);
    }
  }
  if (!editing) {
    return <Button variant="ghost" size="icon" className="h-6 w-6" title="Rename group" onClick={() => { setValue(name); setEditing(true); }}><Pencil className="h-3 w-3" /></Button>;
  }
  return (
    <span className="flex items-center gap-1">
      <Input className="h-7 w-48 text-xs" value={value} onChange={(e) => setValue(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") save(); if (e.key === "Escape") setEditing(false); }} autoFocus />
      <Button variant="ghost" size="icon" className="h-6 w-6" onClick={save} disabled={saving}><Check className="h-3 w-3" /></Button>
      <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setEditing(false)}><X className="h-3 w-3" /></Button>
    </span>
  );
}

function BulkBar({ count, ids, groups, brands, categories, onClear, onDelete, onDone }: {
  count: number; ids: number[]; groups: string[]; brands: string[]; categories: string[];
  onClear: () => void; onDelete: () => void; onDone: () => void;
}) {
  const [group, setGroup] = useState("");
  const [ruleOpen, setRuleOpen] = useState(false);
  const [rule, setRule] = useState({ brandName: "", category: "", keywords: "" });
  const [busy, setBusy] = useState(false);

  async function run(body: Record<string, unknown>, success: (n: number) => string) {
    setBusy(true);
    try {
      const res = await fetch("/api/repository/images/bulk", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ids, ...body }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Failed");
      toast.success(success(data.affected));
      onDone();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-md border bg-muted/40 p-2 flex items-center gap-2 flex-wrap text-sm">
      <span className="font-medium">{count} selected</span>
      <span className="flex items-center gap-1">
        <Input className="h-8 w-44 text-xs" placeholder="Move to group…" value={group} onChange={(e) => setGroup(e.target.value)} list="bulk-groups" />
        <datalist id="bulk-groups">{groups.map((g) => <option key={g} value={g} />)}</datalist>
        <Button size="sm" variant="outline" className="h-8" disabled={busy} onClick={() => run({ action: "group", groupName: group.trim() || null }, (n) => group.trim() ? `Moved ${n} to "${group.trim()}"` : `Removed group from ${n}`)}>
          <FolderInput className="h-3.5 w-3.5 mr-1" />Move
        </Button>
      </span>
      <Button size="sm" variant="outline" className="h-8" onClick={() => setRuleOpen(true)}><ListPlus className="h-3.5 w-3.5 mr-1" />Add rule to all</Button>
      <Button size="sm" variant="outline" className="h-8 text-destructive" onClick={onDelete}><Trash2 className="h-3.5 w-3.5 mr-1" />Delete</Button>
      <Button size="sm" variant="ghost" className="h-8 ml-auto" onClick={onClear}>Clear selection</Button>

      <Dialog open={ruleOpen} onOpenChange={setRuleOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add a rule to {count} images</DialogTitle>
            <DialogDescription>The same rule is added to each selected image. Keywords are space-separated and support -word, &quot;phrases&quot; and /regex/.</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Select value={rule.brandName || "__any__"} onValueChange={(v) => setRule({ ...rule, brandName: v === "__any__" ? "" : v })}>
              <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Brand" /></SelectTrigger>
              <SelectContent><SelectItem value="__any__">Any brand</SelectItem>{brands.map((b) => <SelectItem key={b} value={b}>{b}</SelectItem>)}</SelectContent>
            </Select>
            <Select value={rule.category || "__any__"} onValueChange={(v) => setRule({ ...rule, category: v === "__any__" ? "" : v })}>
              <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Category" /></SelectTrigger>
              <SelectContent><SelectItem value="__any__">Any category</SelectItem>{categories.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
            </Select>
            <Input className="h-8 text-xs" placeholder="Name keywords, e.g. 1g -5pk" value={rule.keywords} onChange={(e) => setRule({ ...rule, keywords: e.target.value })} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRuleOpen(false)}>Cancel</Button>
            <Button disabled={busy || (!rule.brandName && !rule.category && !rule.keywords.trim())} onClick={async () => {
              await run({ action: "rule", rule: { brandName: rule.brandName || null, category: rule.category || null, productNameKeywords: rule.keywords.trim() ? rule.keywords.trim().split(/\s+/) : null } }, (n) => `Added a rule to ${n} images`);
              setRuleOpen(false);
            }}>Add rule</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ConflictsPanel({ conflicts, imageNames, loading, onOpenImage, onClose }: {
  conflicts: { productId: number; productName: string | null; brandName: string | null; winnerImageId: number; winnerImageName: string | null; otherImageIds: number[] }[];
  imageNames: Record<string, string | null>;
  loading: boolean;
  onOpenImage: (id: number) => void;
  onClose: () => void;
}) {
  return (
    <div className="rounded-md border p-3 space-y-2">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold">Rule conflicts</h2>
        <button type="button" className="text-xs text-muted-foreground hover:text-foreground" onClick={onClose}>Close</button>
      </div>
      <p className="text-xs text-muted-foreground">Products whose rules match more than one image. The higher-priority rule wins; the others are ignored. Adjust priorities or exclusions on the images to change the outcome.</p>
      {loading ? (
        <p className="text-xs text-muted-foreground">Checking the catalog…</p>
      ) : conflicts.length === 0 ? (
        <p className="text-xs text-muted-foreground">No conflicts. Every matching product goes to exactly one image.</p>
      ) : (
        <ul className="divide-y max-h-72 overflow-y-auto text-xs">
          {conflicts.map((c) => (
            <li key={c.productId} className="py-1.5 flex items-center gap-2 flex-wrap">
              <span className="flex-1 min-w-48 truncate">{c.productName ?? `Product ${c.productId}`}{c.brandName && <span className="text-muted-foreground"> · {c.brandName}</span>}</span>
              <span className="text-muted-foreground">wins:</span>
              <button type="button" className="underline" onClick={() => onOpenImage(c.winnerImageId)}>{c.winnerImageName ?? `image ${c.winnerImageId}`}</button>
              <span className="text-muted-foreground">also:</span>
              {c.otherImageIds.map((id) => (
                <button key={id} type="button" className="underline text-muted-foreground" onClick={() => onOpenImage(id)}>{imageNames[String(id)] ?? `image ${id}`}</button>
              ))}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
