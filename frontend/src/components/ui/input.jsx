import React from "react";
import { cn } from "../../lib/utils";

export const Input = React.forwardRef(({ className = "", type = "text", ...props }, ref) => {
  return (
    <input
      ref={ref}
      type={type}
      className={cn(
        "flex h-10 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-blue-400",
        className
      )}
      {...props}
    />
  );
});

Input.displayName = "Input";
