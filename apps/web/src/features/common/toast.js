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

export function subscribeToasts(listener) {
  toastListeners.add(listener);
  return () => toastListeners.delete(listener);
}
