import React from "react";
import { cn } from "../../lib/utils";

export function Label({ className = "", ...props }) {
  return (
    <label
      className={cn("text-sm font-medium text-zinc-700", className)}
      {...props}
    />
  );
}

