"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Clock, ImageOff, Upload, Package, FolderOpen } from "lucide-react";
import { cn } from "@/lib/utils";

const navItems = [
  {
    href: "/products/recent",
    label: "Recent Products",
    icon: Clock,
  },
  {
    href: "/products/missing-images",
    label: "Missing Images",
    icon: ImageOff,
  },
  {
    href: "/upload",
    label: "Bulk Upload",
    icon: Upload,
  },
  {
    href: "/repository",
    label: "Image Repository",
    icon: FolderOpen,
  },
];

export function SidebarNav() {
  const pathname = usePathname();

  return (
    <aside className="w-64 border-r border-border bg-card flex flex-col min-h-0">
      <div className="p-4 border-b border-border">
        <Link href="/" className="flex items-center gap-2">
          <Package className="h-6 w-6 text-primary" />
          <span className="font-semibold text-lg">Catalog Manager</span>
        </Link>
      </div>
      <nav className="flex-1 p-3 space-y-1">
        {navItems.map((item) => {
          const isActive = pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors",
                isActive
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
              )}
            >
              <item.icon className="h-4 w-4" />
              {item.label}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
