import React from "react";
import { Toaster as SonnerToaster } from "sonner";

export const Toaster = ({ isDrawerOpen = false, ...props }) => {
  return (
    <SonnerToaster
      position="top-right"
      expand={true}
      richColors={true}
      closeButton={true}
      offset="0.5rem"
      toastOptions={{
        style: {
          right: '8px',
        },
        classNames: {
          toast: "border backdrop-blur-sm shadow-lg animate-in slide-in-from-right-full duration-300 ease-out",
          title: "text-sm font-semibold text-blue-800",
          description: "text-xs text-zinc-600",
          actionButton: "bg-blue-600 hover:bg-blue-700 text-white text-xs",
          cancelButton: "bg-zinc-100 text-zinc-700 hover:bg-zinc-200 text-xs",
          success: "border-blue-700 bg-blue-600 text-white animate-in slide-in-from-right-full duration-300 ease-out",
          error: "border-red-200 bg-red-50/90 text-red-900 animate-in slide-in-from-right-full duration-300 ease-out",
          warning: "border-amber-200 bg-amber-50/90 text-amber-900 animate-in slide-in-from-right-full duration-300 ease-out",
          info: "border-blue-200 bg-blue-50/90 text-blue-900 animate-in slide-in-from-right-full duration-300 ease-out",
        },
      }}
      {...props}
    />
  );
};
