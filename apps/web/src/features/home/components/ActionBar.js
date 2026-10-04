import React, { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Sparkles, Languages, FileBarChart } from "lucide-react";
import { Button } from "../../../components/ui/button";
import { languageCodeToLabel } from "../../../config/i18n";

const ACTION_BUTTON_CLASS = "flex h-7 max-w-full items-center gap-1 rounded-md border-slate-300 bg-white px-2.5 py-1 text-xs text-slate-700 hover:bg-slate-50 max-lg:h-auto max-lg:min-h-11 max-lg:whitespace-normal";

/** Actions apply to the most recent completed answer. */
export default function ActionBar({ t, actionLoading, onApplyAction }) {
  const [showLangPicker, setShowLangPicker] = useState(false);
  const [pickerPosition, setPickerPosition] = useState(null);
  const pickerId = useId();
  const actionRef = useRef(null);
  const translateButtonRef = useRef(null);
  const pickerRef = useRef(null);
  const summarizeButtonRef = useRef(null);
  const shouldFocusPickerRef = useRef(false);

  // A portal keeps the picker usable when the short-height composer must scroll.
  useLayoutEffect(() => {
    if (!showLangPicker) return;
    const viewport = window.visualViewport;
    const updatePosition = () => {
      const trigger = translateButtonRef.current;
      if (!trigger) return;
      const rect = trigger.getBoundingClientRect();
      const viewportTop = viewport?.offsetTop || 0;
      const viewportLeft = viewport?.offsetLeft || 0;
      const viewportHeight = viewport?.height || window.innerHeight;
      const viewportWidth = viewport?.width || window.innerWidth;
      const above = rect.top - viewportTop - 4;
      const below = viewportTop + viewportHeight - rect.bottom - 4;
      const openAbove = above >= below;
      const mobile = window.matchMedia?.("(max-width: 1023px)").matches;
      const desiredHeight = Object.keys(languageCodeToLabel).length * (mobile ? 44 : 28) + 10;
      const maxHeight = Math.min(desiredHeight, Math.max(44, openAbove ? above : below));
      const width = Math.min(128, viewportWidth - 24);
      setPickerPosition({
        left: Math.max(viewportLeft + 12, Math.min(rect.left, viewportLeft + viewportWidth - width - 12)),
        top: Math.max(viewportTop + 4, openAbove ? rect.top - maxHeight - 4 : rect.bottom + 4),
        width,
        maxHeight,
      });
    };
    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    viewport?.addEventListener("resize", updatePosition);
    viewport?.addEventListener("scroll", updatePosition);
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
      viewport?.removeEventListener("resize", updatePosition);
      viewport?.removeEventListener("scroll", updatePosition);
    };
  }, [showLangPicker]);

  useLayoutEffect(() => {
    if (showLangPicker && pickerPosition && shouldFocusPickerRef.current && pickerRef.current) {
      pickerRef.current.querySelector("button")?.focus();
      shouldFocusPickerRef.current = false;
    }
  }, [showLangPicker, pickerPosition]);

  useEffect(() => {
    if (!showLangPicker) return;
    const handleOutsidePointer = (event) => {
      if (!actionRef.current?.contains(event.target) && !pickerRef.current?.contains(event.target)) setShowLangPicker(false);
    };
    const handleEscape = (event) => {
      if (event.key !== "Escape") return;
      setShowLangPicker(false);
      translateButtonRef.current?.focus();
    };
    const handleOutsideFocus = (event) => {
      if (!actionRef.current?.contains(event.target) && !pickerRef.current?.contains(event.target)) setShowLangPicker(false);
    };
    document.addEventListener("pointerdown", handleOutsidePointer);
    document.addEventListener("keydown", handleEscape);
    document.addEventListener("focusin", handleOutsideFocus);
    return () => {
      document.removeEventListener("pointerdown", handleOutsidePointer);
      document.removeEventListener("keydown", handleEscape);
      document.removeEventListener("focusin", handleOutsideFocus);
    };
  }, [showLangPicker]);

  useEffect(() => {
    if (actionLoading) setShowLangPicker(false);
  }, [actionLoading]);

  const handlePickerKeyDown = (event) => {
    if (event.key !== "Tab") return;
    const buttons = pickerRef.current?.querySelectorAll("button");
    if (!buttons?.length) return;
    const leavingBefore = event.shiftKey && event.target === buttons[0];
    const leavingAfter = !event.shiftKey && event.target === buttons[buttons.length - 1];
    if (!leavingBefore && !leavingAfter) return;
    event.preventDefault();
    setShowLangPicker(false);
    (leavingBefore ? translateButtonRef : summarizeButtonRef).current?.focus();
  };

  return (
    <div role="group" aria-label={t?.actionLabel || "アクション"} className="flex items-center gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3 max-lg:flex-wrap">
      <div className="flex items-center gap-2">
        <div className="flex h-5 w-5 items-center justify-center rounded-full bg-blue-600">
          <Sparkles aria-hidden="true" className="h-2.5 w-2.5 text-white" />
        </div>
        <span className="text-xs font-medium text-slate-700">{t?.actionLabel || "アクション"}</span>
      </div>
      <div className="flex min-w-0 items-center gap-2 max-lg:flex-wrap">
      <div className="relative max-w-full" ref={actionRef}>
        <Button
          variant="outline"
          size="sm"
          ref={translateButtonRef}
          type="button"
          aria-expanded={showLangPicker}
          aria-controls={pickerId}
          onClick={() => {
            shouldFocusPickerRef.current = !showLangPicker;
            setShowLangPicker((open) => !open);
          }}
          disabled={actionLoading}
          className={ACTION_BUTTON_CLASS}
        >
          <Languages aria-hidden="true" className="h-3 w-3 shrink-0" />
          <span className="min-w-0 [overflow-wrap:anywhere]">{t?.actionTranslate || "翻訳"}</span>
        </Button>
        {showLangPicker && pickerPosition && createPortal(
          <div ref={pickerRef} id={pickerId} role="group" aria-label={t?.actionTranslate || "翻訳"} onKeyDown={handlePickerKeyDown} style={pickerPosition} className="fixed z-50 overflow-y-auto overscroll-contain rounded-md border border-slate-200 bg-white p-1 shadow-lg">
            {Object.entries(languageCodeToLabel).map(([code, label]) => (
              <button
                key={code}
                type="button"
                className="block min-h-11 w-full rounded-sm p-1.5 text-left text-xs text-slate-700 hover:bg-slate-50 focus-visible:bg-slate-50 focus-visible:outline-none lg:min-h-0"
                onClick={() => {
                  setShowLangPicker(false);
                  translateButtonRef.current?.focus();
                  onApplyAction("translate", code);
                }}
                disabled={actionLoading}
              >
                {label}
              </button>
            ))}
          </div>,
          document.body
        )}
      </div>
      <Button variant="outline" size="sm" ref={summarizeButtonRef} type="button" onClick={() => onApplyAction("summarize")} disabled={actionLoading} className={ACTION_BUTTON_CLASS}>
        <FileBarChart aria-hidden="true" className="h-3 w-3 shrink-0" />
        <span className="min-w-0 [overflow-wrap:anywhere]">{t?.actionSummarize || "要約"}</span>
      </Button>
      <Button variant="outline" size="sm" type="button" onClick={() => onApplyAction("simplify")} disabled={actionLoading} className={ACTION_BUTTON_CLASS}>
        <Sparkles aria-hidden="true" className="h-3 w-3 shrink-0" />
        <span className="min-w-0 [overflow-wrap:anywhere]">{t?.actionSimplify || "わかりやすく"}</span>
      </Button>
      </div>
    </div>
  );
}
