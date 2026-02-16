"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
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
}

export function UploadDialog({ onUploaded }: UploadDialogProps) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [groupName, setGroupName] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  function handleFileSelected(files: File[]) {
    if (files.length === 0) return;
    const f = files[0];
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
      const res = await fetch("/api/repository/images", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          base64Image: base64,
          fileName: file.name,
          mimeType: file.type,
          groupName: groupName.trim() || null,
        }),
      });
      if (!res.ok) throw new Error("Failed to upload");
      toast.success("Image added to repository");
      setOpen(false);
      setName("");
      setGroupName("");
      setFile(null);
      setPreview(null);
      onUploaded();
    } catch {
      toast.error("Failed to add image");
    } finally {
      setUploading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="h-4 w-4 mr-1" />
          Add Image
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add Image to Repository</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
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
            {uploading ? "Uploading..." : "Add to Repository"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
