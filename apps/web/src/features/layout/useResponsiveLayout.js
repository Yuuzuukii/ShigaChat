import { useEffect, useState } from "react";

export const DESKTOP_QUERY = "(min-width: 1024px)";

// Match the CSS breakpoint instead of guessing from a device or user agent.
export function useIsMobile() {
  const [isMobile, setIsMobile] = useState(() => !window.matchMedia(DESKTOP_QUERY).matches);
  useEffect(() => {
    const media = window.matchMedia(DESKTOP_QUERY);
    const update = () => setIsMobile(!media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  return isMobile;
}

// The visual viewport also shrinks when a mobile software keyboard opens.
export function useAppViewport(shellRef, isMobile, isMounted) {
  useEffect(() => {
    const shell = shellRef.current;
    const viewport = window.visualViewport;
    if (!shell || !viewport || !isMobile) return;
    const update = () => {
      if (viewport.scale === 1) shell.style.setProperty("--app-height", `${viewport.height}px`);
    };
    update();
    viewport.addEventListener("resize", update);
    return () => {
      viewport.removeEventListener("resize", update);
      shell.style.removeProperty("--app-height");
    };
  }, [shellRef, isMobile, isMounted]);
}
