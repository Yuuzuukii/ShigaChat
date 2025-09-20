export function cn(...classes) {
  return classes.filter(Boolean).join(" ");
}

// Re-export toast so components import from lib/utils instead of 'sonner'
export { toast } from 'sonner';
