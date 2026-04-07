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
    <aside className="w-64 bg-sidebar flex flex-col min-h-0">
      <div className="p-4 border-b border-sidebar-border">
        <Link href="/" className="flex items-center gap-2">
          <Package className="h-6 w-6 text-sidebar-primary" />
          <span className="font-semibold text-lg text-sidebar-foreground">
            Catalog Manager
          </span>
        </Link>
      </div>
      <nav className="flex-1 p-3 space-y-1">
        <div className="px-3 py-2">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-sidebar-foreground/50">
            Navigation
          </span>
        </div>
        {navItems.map((item) => {
          const isActive = pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors",
                isActive
                  ? "bg-sidebar-accent text-sidebar-accent-foreground border-l-2 border-sidebar-primary"
                  : "text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
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
