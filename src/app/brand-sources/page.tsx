"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useBrandSources, useBrandSourceScan } from "@/hooks/use-brand-sources";
import { useProductFacets } from "@/hooks/use-products";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Globe, Loader2, ScanSearch, Trash2, ExternalLink, FolderPlus, Plus } from "lucide-react";
import { toast } from "sonner";
import type { BrandSourceRow } from "@/app/api/brand-sources/route";
import type { ScanCandidate } from "@/app/api/brand-sources/[id]/scan/route";

export default function BrandSourcesPage() {
  const { sources, isLoading, mutate } = useBrandSources();
  const { facets } = useProductFacets({ isActive: true });
  const [activeId, setActiveId] = useState<number | null>(null);

  const grouped = useMemo(() => {
    const map = new Map<string, BrandSourceRow[]>();
    for (const source of sources) map.set(source.brandName, [...(map.get(source.brandName) ?? []), source]);
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [sources]);

  async function handleDelete(source: BrandSourceRow) {
    if (!confirm(`Remove ${source.label || source.url} for ${source.brandName}? Imported images stay in the repository.`)) return;
    const res = await fetch(`/api/brand-sources/${source.id}`, { method: "DELETE" });
    if (!res.ok) { toast.error("Failed to remove source"); return; }
    if (activeId === source.id) setActiveId(null);
    await mutate();
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Brand Sources</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Save the pages where other companies publish their product images (their own site, Leafly, a Dutchie menu).
          Scan a page to crawl it and its product links, then import the images into the repository with matching rules.
        </p>
      </div>

      <AddSourceForm brands={facets?.brands ?? []} onSaved={() => mutate()} />

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading sources...</p>
      ) : grouped.length === 0 ? (
        <p className="text-sm text-muted-foreground">No sources saved yet. Add a brand page above to get started.</p>
      ) : (
        <div className="space-y-6">
          {grouped.map(([brand, list]) => (
            <section key={brand} className="space-y-2">
              <h2 className="font-semibold flex items-center gap-2">
                {brand}
                <Link href={`/repository`} className="text-xs text-muted-foreground hover:underline font-normal">repository group</Link>
              </h2>
              {list.map((source) => (
                <div key={source.id} className="rounded-lg border p-3 space-y-3">
                  <div className="flex items-center gap-3 flex-wrap">
                    <Globe className="h-4 w-4 text-muted-foreground shrink-0" />
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium truncate">{source.label || source.url}</div>
                      <a href={source.url} target="_blank" rel="noreferrer" className="text-xs text-muted-foreground hover:underline truncate block">
                        {source.url}{source.pathPrefix ? ` (only under ${source.pathPrefix})` : ""}
                      </a>
                      <div className="text-xs text-muted-foreground">
                        {source.lastScannedAt
                          ? `Last scan ${new Date(source.lastScannedAt).toLocaleString()}: ${source.lastScanSummary?.candidates ?? 0} images on ${source.lastScanSummary?.pagesVisited ?? 0} pages${source.lastScanSummary?.truncated ? " (hit a limit)" : ""}`
                          : "Never scanned"}
                      </div>
                    </div>
                    <Button size="sm" variant={activeId === source.id ? "default" : "outline"} onClick={() => setActiveId(activeId === source.id ? null : source.id)}>
                      <ScanSearch className="h-4 w-4 mr-1" />
                      {activeId === source.id ? "Close" : "Scan"}
                    </Button>
                    <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => handleDelete(source)} title="Remove source">
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                  {activeId === source.id && (
                    <>
                      <CookieEditor source={source} onSaved={() => mutate()} />
                      <ScanPanel source={source} onImported={() => mutate()} />
                    </>
                  )}
                </div>
              ))}
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

function AddSourceForm({ brands, onSaved }: { brands: string[]; onSaved: () => void }) {
  const [brand, setBrand] = useState("");
  const [customBrand, setCustomBrand] = useState("");
  const [url, setUrl] = useState("");
  const [label, setLabel] = useState("");
  const [prefix, setPrefix] = useState("");
  const [cookies, setCookies] = useState("");
  const [saving, setSaving] = useState(false);
  const brandName = brand === "__custom" ? customBrand.trim() : brand;

  async function handleSave() {
    if (!brandName || !url.trim()) { toast.error("Choose a brand and enter a page URL"); return; }
    setSaving(true);
    try {
      const res = await fetch("/api/brand-sources", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ brandName, url: url.trim(), label: label.trim() || null, pathPrefix: prefix.trim() || null, cookies: cookies.trim() || null }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Failed to save");
      toast.success(`Saved source for ${brandName}`);
      setUrl(""); setLabel(""); setPrefix(""); setCookies("");
      onSaved();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rounded-lg border p-4 space-y-3">
      <h2 className="font-semibold text-sm">Add a source page</h2>
      <div className="flex items-end gap-2 flex-wrap">
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">Brand</label>
          <Select value={brand} onValueChange={setBrand}>
            <SelectTrigger className="w-56" size="sm"><SelectValue placeholder="Choose a brand" /></SelectTrigger>
            <SelectContent>
              {brands.map((name) => <SelectItem key={name} value={name}>{name}</SelectItem>)}
              <SelectItem value="__custom">Other brand…</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {brand === "__custom" && (
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Brand name (must match Dutchie)</label>
            <Input className="w-48 h-8" value={customBrand} onChange={(e) => setCustomBrand(e.target.value)} placeholder="Exact brand name" />
          </div>
        )}
        <div className="space-y-1 flex-1 min-w-64">
          <label className="text-xs text-muted-foreground">Page URL (paste from your browser)</label>
          <Input className="h-8" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://brand.com/collections/all" />
        </div>
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">Label (optional)</label>
          <Input className="w-40 h-8" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Website shop" />
        </div>
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">Only follow links under (optional)</label>
          <Input className="w-48 h-8" value={prefix} onChange={(e) => setPrefix(e.target.value)} placeholder="/collections/pre-rolls" />
        </div>
        <div className="space-y-1 flex-1 min-w-64">
          <label className="text-xs text-muted-foreground">Cookies (optional, for sites with an age confirmation or login)</label>
          <Input className="h-8" value={cookies} onChange={(e) => setCookies(e.target.value)} placeholder="name=value; name2=value2" />
        </div>
        <Button size="sm" onClick={handleSave} disabled={saving}>
          {saving ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Plus className="h-4 w-4 mr-1" />}
          Save
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        The scan reads the page, its pagination, and one level of product links on the same site (up to about 150 pages).
        If a site asks for an age confirmation or a login before showing products, confirm it once in your own browser, then copy that
        site&apos;s cookies (DevTools → Application → Cookies, as <code>name=value; name2=value2</code>) into the Cookies field so the scan
        uses your session. Pages that only render in JavaScript, such as Dutchie menus, may yield nothing.
      </p>
    </div>
  );
}

function CookieEditor({ source, onSaved }: { source: BrandSourceRow; onSaved: () => void }) {
  const [value, setValue] = useState(source.cookies ?? "");
  const [saving, setSaving] = useState(false);
  const dirty = value.trim() !== (source.cookies ?? "");
  async function save() {
    setSaving(true);
    try {
      const res = await fetch(`/api/brand-sources/${source.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cookies: value.trim() || null }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "Failed to save");
      toast.success(value.trim() ? "Cookies saved" : "Cookies cleared");
      onSaved();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }
  return (
    <div className="flex items-center gap-2 border-t pt-3 text-xs">
      <span className="text-muted-foreground shrink-0">Cookies</span>
      <Input
        className="h-7 text-xs"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Optional: paste from your browser if the site needs an age confirmation or login"
      />
      <Button size="sm" variant="outline" className="h-7" onClick={save} disabled={!dirty || saving}>Save</Button>
    </div>
  );
}

function ScanPanel({ source, onImported }: { source: BrandSourceRow; onImported: () => void }) {
  const { state, scan, markImported } = useBrandSourceScan();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [titles, setTitles] = useState<Record<string, string>>({});
  const [showImported, setShowImported] = useState(false);
  const [createRules, setCreateRules] = useState(true);
  const [importing, setImporting] = useState(false);

  const visible = useMemo(
    () => state.candidates.filter((c) => showImported || !c.imported),
    [state.candidates, showImported]
  );
  const newCount = state.candidates.filter((c) => !c.imported).length;

  function toggle(url: string) {
    setSelected((prev) => { const next = new Set(prev); if (next.has(url)) next.delete(url); else next.add(url); return next; });
  }

  function selectAllNew() {
    setSelected(new Set(visible.filter((c) => !c.imported).map((c) => c.imageUrl)));
  }

  async function handleImport() {
    const items = state.candidates
      .filter((c) => selected.has(c.imageUrl) && !c.imported)
      .map((c) => ({ imageUrl: c.imageUrl, title: titles[c.imageUrl] ?? c.title, pageUrl: c.pageUrl }));
    if (!items.length) return;
    setImporting(true);
    try {
      const res = await fetch(`/api/brand-sources/${source.id}/import`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items, createRules }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Import failed");
      const okUrls = (data.results as { imageUrl: string; id?: number; error?: string }[]).filter((r) => r.id).map((r) => r.imageUrl);
      markImported(okUrls);
      setSelected(new Set());
      const message = `Imported ${data.imported} image${data.imported === 1 ? "" : "s"}${data.skipped ? `, ${data.skipped} already there` : ""}${data.failed ? `, ${data.failed} failed` : ""}`;
      if (data.failed) toast.error(message); else toast.success(message);
      onImported();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Import failed");
    } finally {
      setImporting(false);
    }
  }

  return (
    <div className="space-y-3 border-t pt-3">
      <div className="flex items-center gap-2 flex-wrap">
        <Button size="sm" onClick={() => { setSelected(new Set()); scan(source.id); }} disabled={state.status === "scanning"}>
          {state.status === "scanning" ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <ScanSearch className="h-4 w-4 mr-1" />}
          {state.status === "scanning" ? "Scanning…" : state.status === "idle" ? "Start scan" : "Scan again"}
        </Button>
        {state.status === "scanning" && (
          <span className="text-sm text-muted-foreground">
            {state.pagesVisited} pages read, {state.queued} queued, {state.found} images found
          </span>
        )}
        {state.status === "done" && (
          <span className="text-sm text-muted-foreground">
            {state.candidates.length} images on {state.pagesVisited} pages · {newCount} new
            {state.truncated && ` · stopped at the ${state.truncatedReason === "time" ? "time" : "page"} limit`}
            {state.errors.length > 0 && ` · ${state.errors.length} pages failed`}
          </span>
        )}
        {state.status === "done" && state.ageGated && (
          <span className="text-sm text-amber-700">
            This site shows an age confirmation instead of its products. Confirm it in your browser, paste the site&apos;s cookies into this source above, and scan again.
          </span>
        )}
        {state.status === "error" && <span className="text-sm text-destructive">{state.error}</span>}
      </div>
      {state.status === "scanning" && <Progress value={state.pagesVisited + state.queued ? (state.pagesVisited / (state.pagesVisited + state.queued)) * 100 : 0} className="h-2" />}

      {state.status === "done" && state.candidates.length === 0 && (
        <p className="text-sm text-muted-foreground">
          No product images found. The page may render only in JavaScript, or its images may be on a different page. Try the brand&apos;s Leafly page or a collection page instead.
        </p>
      )}

      {state.candidates.length > 0 && (
        <>
          <div className="flex items-center gap-3 flex-wrap text-sm">
            <Button size="sm" variant="outline" onClick={selectAllNew}>Select all new ({visible.filter((c) => !c.imported).length})</Button>
            <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())} disabled={selected.size === 0}>Clear</Button>
            <label className="flex items-center gap-2"><Checkbox checked={showImported} onCheckedChange={(c) => setShowImported(c === true)} />Show already imported</label>
            <label className="flex items-center gap-2"><Checkbox checked={createRules} onCheckedChange={(c) => setCreateRules(c === true)} />Create matching rules (brand + name keywords)</label>
            <Button size="sm" className="ml-auto" onClick={handleImport} disabled={importing || selected.size === 0}>
              {importing ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <FolderPlus className="h-4 w-4 mr-1" />}
              Import {selected.size} to repository
            </Button>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
            {visible.map((candidate) => (
              <CandidateCard
                key={candidate.imageUrl}
                candidate={candidate}
                selected={selected.has(candidate.imageUrl)}
                title={titles[candidate.imageUrl] ?? candidate.title}
                onToggle={() => !candidate.imported && toggle(candidate.imageUrl)}
                onTitle={(value) => setTitles((prev) => ({ ...prev, [candidate.imageUrl]: value }))}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function CandidateCard({ candidate, selected, title, onToggle, onTitle }: {
  candidate: ScanCandidate;
  selected: boolean;
  title: string;
  onToggle: () => void;
  onTitle: (value: string) => void;
}) {
  return (
    <div className={`rounded-md border p-2 space-y-1 ${selected ? "border-primary ring-2 ring-primary/30" : ""} ${candidate.imported ? "opacity-60" : ""}`}>
      <button type="button" onClick={onToggle} className="relative block w-full aspect-square rounded overflow-hidden bg-muted" disabled={candidate.imported}>
        <img src={candidate.imageUrl} alt={title} className="w-full h-full object-contain" loading="lazy" referrerPolicy="no-referrer" />
        {candidate.imported && <Badge variant="secondary" className="absolute top-1 left-1 text-[10px]">In repository</Badge>}
        {candidate.fromProductPage && !candidate.imported && <Badge variant="outline" className="absolute top-1 left-1 text-[10px] bg-background/80">Product page</Badge>}
      </button>
      <Input value={title} onChange={(e) => onTitle(e.target.value)} className="h-7 text-xs" placeholder="Image name" disabled={candidate.imported} />
      <div className="flex items-center justify-between text-[10px] text-muted-foreground">
        <span className="truncate" title={candidate.keywords.join(", ")}>{candidate.keywords.length ? `rule: ${candidate.keywords.join(" ")}` : "no keywords"}</span>
        <a href={candidate.pageUrl} target="_blank" rel="noreferrer" title="Open page" className="shrink-0 hover:text-foreground"><ExternalLink className="h-3 w-3" /></a>
      </div>
    </div>
  );
}
