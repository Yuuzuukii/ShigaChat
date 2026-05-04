import React from "react";
import * as ToastPrimitive from "@radix-ui/react-toast";
import { AlertTriangle, CheckCircle2, Info, X, XCircle } from "lucide-react";

const joinClassNames = (...classes) => classes.filter(Boolean).join(" ");

const toastListeners = new Set();

function emitToast(type, title, options = {}) {
  const payload = {
    id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    type,
    title,
    description: options.description,
    duration: options.duration ?? 4000,
  };

  toastListeners.forEach((listener) => listener(payload));
  return payload.id;
}

export const toast = {
  success: (title, options) => emitToast("success", title, options),
  error: (title, options) => emitToast("error", title, options),
  warning: (title, options) => emitToast("warning", title, options),
  info: (title, options) => emitToast("info", title, options),
  message: (title, options) => emitToast("default", title, options),
};

function subscribeToasts(listener) {
  toastListeners.add(listener);
  return () => toastListeners.delete(listener);
}

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
            className={joinClassNames(
              "grid w-[min(22rem,calc(100vw-1rem))] grid-cols-[auto_1fr_auto] items-start gap-3 rounded-md border p-3 shadow-lg data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=open]:slide-in-from-right data-[state=closed]:fade-out-80",
              style.root
            )}
          >
            <Icon className={joinClassNames("mt-0.5 h-4 w-4", style.iconClass)} />
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
