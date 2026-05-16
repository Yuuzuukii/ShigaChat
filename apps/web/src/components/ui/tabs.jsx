import * as React from "react";
import * as TabsPrimitive from "@radix-ui/react-tabs";
import { cn } from "../../features/common/classNames";

export const Tabs = TabsPrimitive.Root;

export const TabsList = React.forwardRef(({ className = "", ...props }, ref) => (
  <TabsPrimitive.List
    ref={ref}
    className={cn(
      "grid w-full overflow-hidden rounded-t-[1.4rem] border border-b-0 border-blue-100 bg-zinc-100",
      className
    )}
    {...props}
  />
));
TabsList.displayName = TabsPrimitive.List.displayName;

export const TabsTrigger = React.forwardRef(({ className = "", ...props }, ref) => (
  <TabsPrimitive.Trigger
    ref={ref}
    className={cn(
      "relative inline-flex min-w-0 items-center justify-center border-r border-blue-100 bg-zinc-100 px-2 py-3 transition-colors last:border-r-0 focus-visible:z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:ring-inset disabled:cursor-not-allowed disabled:opacity-60 hover:bg-zinc-50 data-[state=active]:z-10 data-[state=active]:bg-white",
      className
    )}
    {...props}
  />
));
TabsTrigger.displayName = TabsPrimitive.Trigger.displayName;

export const TabsContent = React.forwardRef(({ className = "", ...props }, ref) => (
  <TabsPrimitive.Content
    ref={ref}
    className={cn("focus-visible:outline-none", className)}
    {...props}
  />
));
TabsContent.displayName = TabsPrimitive.Content.displayName;
