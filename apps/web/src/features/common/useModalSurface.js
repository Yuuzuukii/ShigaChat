import { useEffect, useRef } from "react";

const surfaces = [];
let previousOverflow;
const focusableSelector = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex="0"]';

// Only the topmost surface traps focus when a dialog opens inside the drawer.
export function useModalSurface(open, surfaceRef, onClose, backgroundRef, extraSurfaceRef) {
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    const surface = surfaceRef.current;
    if (!open || !surface) return;
    const previousFocus = document.activeElement;
    const background = backgroundRef?.current;
    const wasInert = background?.hasAttribute("inert");
    background?.setAttribute("inert", "");
    if (surfaces.length === 0) {
      previousOverflow = document.body.style.overflow;
      document.body.style.overflow = "hidden";
    }
    surfaces.push(surface);
    const containsFocus = (element) => surface.contains(element) || extraSurfaceRef?.current?.contains(element);
    const getFocusable = () => [surface, extraSurfaceRef?.current]
      .filter(Boolean)
      .flatMap((container) => Array.from(container.querySelectorAll(focusableSelector)))
      .filter((element) => !element.closest('[hidden], [inert]'));
    (getFocusable()[0] || surface).focus();
    const handleKeyDown = (event) => {
      if (surfaces[surfaces.length - 1] !== surface) return;
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        closeRef.current();
      }
      if (event.key !== "Tab") return;
      const elements = getFocusable();
      const first = elements[0] || surface;
      const last = elements[elements.length - 1] || surface;
      if (event.shiftKey && (document.activeElement === first || !containsFocus(document.activeElement))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (document.activeElement === last || !containsFocus(document.activeElement))) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      const wasTopSurface = surfaces[surfaces.length - 1] === surface;
      const index = surfaces.indexOf(surface);
      if (index !== -1) surfaces.splice(index, 1);
      if (surfaces.length === 0) document.body.style.overflow = previousOverflow;
      if (!wasInert) background?.removeAttribute("inert");
      if (wasTopSurface && previousFocus?.isConnected && !previousFocus.closest("[hidden], [inert]")) previousFocus.focus();
    };
  }, [open, surfaceRef, backgroundRef, extraSurfaceRef]);
}
