"use client";

import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { RuleEditor } from "@/components/repository/rule-editor";
import { UploadDialog } from "@/components/repository/upload-dialog";
import { repositoryImageUrl } from "@/lib/repository-utils";
import { ExternalLink, RefreshCw, Trash2, Save, Loader2 } from "lucide-react";
import { toast } from "sonner";
import type { RepositoryImage } from "@/lib/types";

interface ImageDetailDialogProps {
  image: RepositoryImage | null;
  groups: string[];
  brands: string[];
  categories: string[];
  onClose: () => void;
  onChanged: () => void;
  onDelete: (image: RepositoryImage) => void;
}

export function ImageDetailDialog({ image, groups, brands, categories, onClose, onChanged, onDelete }: ImageDetailDialogProps) {
  const [name, setName] = useState("");
  const [group, setGroup] = useState("");
  const [saving, setSaving] = useState(false);
  const [replacing, setReplacing] = useState(false);

  useEffect(() => {
    setName(image?.name ?? "");
    setGroup(image?.groupName ?? "");
  }, [image?.id, image?.name, image?.groupName]);

  if (!image) return null;
  const dirty = name.trim() !== image.name || (group.trim() || null) !== image.groupName;

  async function saveMeta() {
    if (!image || !name.trim()) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/repository/images/${image.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), groupName: group.trim() || null }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "Failed to save");
      toast.success("Saved");
      onChanged();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-5xl max-w-[calc(100%-1rem)] max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="truncate">{image.name}</DialogTitle>
          <DialogDescription>
            {image.groupName ? `Group: ${image.groupName}` : "No group"} · applied to {image.appliedCount} product{image.appliedCount === 1 ? "" : "s"} · {image.rules.length} rule{image.rules.length === 1 ? "" : "s"}
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-6 md:grid-cols-[18rem_1fr]">
          <div className="space-y-3">
            <img src={repositoryImageUrl(image)} alt={image.name} className="w-full aspect-square object-contain rounded-lg border bg-background" />
            <div className="space-y-2">
              <div>
                <label className="text-xs text-muted-foreground">Name</label>
                <Input className="h-8" value={name} onChange={(e) => setName(e.target.value)} />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Group</label>
                <Input className="h-8" value={group} onChange={(e) => setGroup(e.target.value)} placeholder="None" list={`groups-${image.id}`} />
                <datalist id={`groups-${image.id}`}>{groups.map((g) => <option key={g} value={g} />)}</datalist>
              </div>
              <Button size="sm" className="w-full" onClick={saveMeta} disabled={!dirty || saving || !name.trim()}>
                {saving ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <Save className="h-3 w-3 mr-1" />}
                Save name and group
              </Button>
            </div>
            <div className="text-xs text-muted-foreground space-y-1">
              <div>File: {image.fileName} ({image.mimeType.replace("image/", "")})</div>
              <div>Added {new Date(image.createdAt).toLocaleDateString()}{image.updatedAt && image.updatedAt !== image.createdAt ? ` · updated ${new Date(image.updatedAt).toLocaleDateString()}` : ""}</div>
              {image.sourceUrl ? (
                <a href={image.sourceUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 hover:underline break-all">
                  <ExternalLink className="h-3 w-3 shrink-0" />Imported from {safeHost(image.sourceUrl)}
                </a>
              ) : (
                <div>Uploaded manually</div>
              )}
              {image.excludedProductIds.length > 0 && <Badge variant="secondary" className="text-[10px]">{image.excludedProductIds.length} products excluded</Badge>}
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" className="flex-1" onClick={() => setReplacing(true)}>
                <RefreshCw className="h-3 w-3 mr-1" />Replace
              </Button>
              <Button variant="outline" size="sm" className="flex-1 text-destructive" onClick={() => onDelete(image)}>
                <Trash2 className="h-3 w-3 mr-1" />Delete
              </Button>
            </div>
          </div>
          <div>
            <RuleEditor
              imageId={image.id}
              rules={image.rules}
              excludedProductIds={image.excludedProductIds ?? []}
              brands={brands}
              categories={categories}
              onChanged={onChanged}
              onApplied={onChanged}
            />
          </div>
        </div>
        {replacing && (
          <UploadDialog
            replaceImageId={image.id}
            initialName={image.name}
            initialGroupName={image.groupName}
            hideTrigger
            open
            onOpenChange={(open) => { if (!open) setReplacing(false); }}
            onUploaded={() => { setReplacing(false); onChanged(); }}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function safeHost(url: string): string {
  try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return url; }
}
