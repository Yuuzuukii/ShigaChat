import React from "react";
import * as ToastPrimitive from "@radix-ui/react-toast";
import { AlertTriangle, CheckCircle2, Info, X, XCircle } from "lucide-react";
import { cn, subscribeToasts } from "../../lib/utils";

const toastStyles = {
  default: {
    icon: Info,
    root: "border-zinc-200 bg-white text-zinc-900",
    iconClass: "text-blue-600",
  },
  success: {
    icon: CheckCircle2,
    root: "border-blue-700 bg-blue-600 text-white",
    iconClass: "text-white",
  },
  error: {
    icon: XCircle,
    root: "border-red-200 bg-red-50 text-red-900",
    iconClass: "text-red-600",
  },
  warning: {
    icon: AlertTriangle,
    root: "border-amber-200 bg-amber-50 text-amber-900",
    iconClass: "text-amber-600",
  },
  info: {
    icon: Info,
    root: "border-blue-200 bg-blue-50 text-blue-900",
    iconClass: "text-blue-600",
  },
};

export function Toaster({ isDrawerOpen: _isDrawerOpen = false }) {
  const [toasts, setToasts] = React.useState([]);

  React.useEffect(() => {
    return subscribeToasts((toast) => {
      setToasts((current) => [...current, toast]);
    });
  }, []);

  const removeToast = React.useCallback((id) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  return (
    <ToastPrimitive.Provider swipeDirection="right">
      {toasts.map((toast) => {
        const style = toastStyles[toast.type] || toastStyles.default;
        const Icon = style.icon;

        return (
          <ToastPrimitive.Root
            key={toast.id}
            duration={toast.duration}
            onOpenChange={(open) => {
              if (!open) removeToast(toast.id);
            }}
            className={cn(
              "grid w-[min(22rem,calc(100vw-1rem))] grid-cols-[auto_1fr_auto] items-start gap-3 rounded-md border p-3 shadow-lg data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=open]:slide-in-from-right data-[state=closed]:fade-out-80",
              style.root
            )}
          >
            <Icon className={cn("mt-0.5 h-4 w-4", style.iconClass)} />
            <div className="min-w-0">
              <ToastPrimitive.Title className="text-sm font-semibold leading-5">
                {toast.title}
              </ToastPrimitive.Title>
              {toast.description && (
                <ToastPrimitive.Description className="mt-1 text-xs leading-5 opacity-80">
                  {toast.description}
                </ToastPrimitive.Description>
              )}
            </div>
            <ToastPrimitive.Close className="rounded p-1 opacity-70 transition-opacity hover:opacity-100">
              <X className="h-4 w-4" />
            </ToastPrimitive.Close>
          </ToastPrimitive.Root>
        );
      })}
      <ToastPrimitive.Viewport className="fixed bottom-2 right-2 z-[300] flex max-h-screen flex-col gap-2 outline-none" />
    </ToastPrimitive.Provider>
  );
}
