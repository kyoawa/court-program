"use client";

import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FileDropZone } from "@/components/upload/file-drop-zone";
import { fileToBase64 } from "@/lib/image-utils";
import { Plus, Loader2 } from "lucide-react";
import { toast } from "sonner";

interface UploadDialogProps {
  onUploaded: () => void;
  replaceImageId?: number;
  initialName?: string;
  initialGroupName?: string | null;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  hideTrigger?: boolean;
}

export function UploadDialog({
  onUploaded,
  replaceImageId,
  initialName,
  initialGroupName,
  open: openProp,
  onOpenChange: onOpenChangeProp,
  hideTrigger,
}: UploadDialogProps) {
  const [internalOpen, setInternalOpen] = useState(false);
  const open = openProp ?? internalOpen;
  const setOpen = (v: boolean) => {
    if (onOpenChangeProp) onOpenChangeProp(v);
    else setInternalOpen(v);
  };
  const isReplace = replaceImageId !== undefined;
  const [name, setName] = useState(initialName ?? "");
  const [groupName, setGroupName] = useState(initialGroupName ?? "");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    if (open) {
      setName(initialName ?? "");
      setGroupName(initialGroupName ?? "");
    }
  }, [open, initialName, initialGroupName]);

  // Clean up Object URL when preview changes or component unmounts
  useEffect(() => {
    return () => {
      if (preview) {
        URL.revokeObjectURL(preview);
      }
    };
  }, [preview]);

  function handleFileSelected(files: File[]) {
    if (files.length === 0) return;
    const f = files[0];
    // Revoke old URL before creating a new one
    if (preview) {
      URL.revokeObjectURL(preview);
    }
    setFile(f);
    setPreview(URL.createObjectURL(f));
    if (!name) {
      setName(f.name.replace(/\.[^.]+$/, ""));
    }
  }

  async function handleUpload() {
    if (!file || !name.trim()) {
      toast.error("Please provide a name and image");
      return;
    }

    setUploading(true);
    try {
      const base64 = await fileToBase64(file);
      const url = isReplace
        ? `/api/repository/images/${replaceImageId}`
        : "/api/repository/images";
      const res = await fetch(url, {
        method: isReplace ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          base64Image: base64,
          fileName: file.name,
          mimeType: file.type,
          groupName: groupName.trim() || null,
        }),
      });
      if (!res.ok) throw new Error(isReplace ? "Failed to replace" : "Failed to upload");
      toast.success(isReplace ? "Image replaced" : "Image added to repository");
      if (preview) URL.revokeObjectURL(preview);
      setOpen(false);
      setName("");
      setGroupName("");
      setFile(null);
      setPreview(null);
      onUploaded();
    } catch {
      toast.error(isReplace ? "Failed to replace image" : "Failed to add image");
    } finally {
      setUploading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {!hideTrigger && (
        <DialogTrigger asChild>
          <Button>
            <Plus className="h-4 w-4 mr-1" />
            Add Image
          </Button>
        </DialogTrigger>
      )}
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {isReplace ? "Replace Image" : "Add Image to Repository"}
          </DialogTitle>
          <DialogDescription>
            {isReplace
              ? "Upload a new image to replace this one. The image ID stays the same so all matching rules remain intact."
              : "Upload an image and give it a name to use with matching rules."}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          {isReplace && (
            <div className="rounded-md border border-amber-300 bg-amber-50 dark:bg-amber-950/30 p-3 text-xs text-amber-900 dark:text-amber-200">
              This will update the image but keep all matching rules intact.
            </div>
          )}
          <div>
            <label className="text-sm font-medium">Name</label>
            <Input
              placeholder="e.g. Lookah Seahorse Pro"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div>
            <label className="text-sm font-medium">Group <span className="text-muted-foreground font-normal">(optional)</span></label>
            <Input
              placeholder="e.g. Lionheart Nano Pods"
              value={groupName}
              onChange={(e) => setGroupName(e.target.value)}
            />
          </div>
          {preview ? (
            <div className="space-y-2">
              <img
                src={preview}
                alt="Preview"
                className="w-full max-h-48 object-contain rounded-md border"
              />
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  if (preview) URL.revokeObjectURL(preview);
                  setFile(null);
                  setPreview(null);
                }}
              >
                Change Image
              </Button>
            </div>
          ) : (
            <FileDropZone onFilesSelected={handleFileSelected} />
          )}
          <Button
            className="w-full"
            onClick={handleUpload}
            disabled={!file || !name.trim() || uploading}
          >
            {uploading && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
            {uploading
              ? isReplace
                ? "Replacing..."
                : "Uploading..."
              : isReplace
                ? "Replace"
                : "Add to Repository"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
