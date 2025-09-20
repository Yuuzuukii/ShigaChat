import React from "react";
import { cn } from "../../lib/utils";

export function Card({ className = "", ...props }) {
  return (
    <div
      className={cn(
        "rounded-xl border border-zinc-100 bg-white/90 backdrop-blur shadow-lg",
        className
      )}
      {...props}
    />
  );
}

export function CardHeader({ className = "", ...props }) {
  return (
    <div className={cn("p-6 pb-2", className)} {...props} />
  );
}

export function CardTitle({ className = "", ...props }) {
  return (
    <h3 className={cn("text-lg font-semibold", className)} {...props} />
  );
}

export function CardContent({ className = "", ...props }) {
  return <div className={cn("p-6 pt-2", className)} {...props} />;
}
