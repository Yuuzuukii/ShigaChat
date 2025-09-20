import React from "react";
import { cn } from "../../lib/utils";

export function Sidebar({ open = false, className = "", children, ...props }) {
  return (
    <aside
      className={cn(
        "fixed inset-y-0 left-0 z-40 w-72 transform border-r border-blue-100 bg-white/90 backdrop-blur shadow-lg transition-transform overflow-visible",
        open ? "translate-x-0" : "-translate-x-full",
        className
      )}
      {...props}
    >
      {children}
    </aside>
  );
}

export function SidebarHeader({ className = "", ...props }) {
  return (
    <div className={cn("flex items-center justify-between border-b border-blue-100 px-4 py-3", className)} {...props} />
  );
}

export function SidebarContent({ className = "", ...props }) {
  return (
    <div className={cn("h-[calc(100%-48px)] overflow-y-auto overflow-x-visible p-2", className)} {...props} />
  );
}
