"use client";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Trash2, CheckCircle, XCircle, Loader2, Clock } from "lucide-react";
import type { UploadItem } from "@/hooks/use-upload-queue";

interface UploadQueueTableProps {
  items: UploadItem[];
  onRemove: (id: string) => void;
}

const statusConfig = {
  queued: { icon: Clock, label: "Queued", variant: "secondary" as const },
  uploading: { icon: Loader2, label: "Uploading", variant: "default" as const },
  success: { icon: CheckCircle, label: "Done", variant: "default" as const },
  failed: { icon: XCircle, label: "Failed", variant: "destructive" as const },
};

export function UploadQueueTable({ items, onRemove }: UploadQueueTableProps) {
  if (items.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        No images in the upload queue.
      </div>
    );
  }

  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Product</TableHead>
            <TableHead>Source</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="w-10" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((item) => {
            const config = statusConfig[item.status];
            const Icon = config.icon;
            return (
              <TableRow key={item.id}>
                <TableCell className="font-medium">
                  {item.productName}
                </TableCell>
                <TableCell className="text-sm text-muted-foreground max-w-xs truncate">
                  {item.source.type === "file"
                    ? item.source.file.name
                    : item.source.url}
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <Badge variant={config.variant} className="text-xs gap-1">
                      <Icon
                        className={`h-3 w-3 ${item.status === "uploading" ? "animate-spin" : ""}`}
                      />
                      {config.label}
                    </Badge>
                    {item.error && (
                      <span className="text-xs text-destructive">
                        {item.error}
                      </span>
                    )}
                  </div>
                </TableCell>
                <TableCell>
                  {item.status !== "uploading" && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      onClick={() => onRemove(item.id)}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
