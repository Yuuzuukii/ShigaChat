/**
 * ActionBar - アクション機能（翻訳・要約・書き換え）
 */
import React, { useState, useRef, useEffect } from "react";
import { Sparkles, Languages, FileBarChart } from "lucide-react";
import { Button } from "../ui/button";
import { languageCodeToLabel } from "../../config/i18n";

export default function ActionBar({ t, actionLoading, onApplyAction }) {
  const [showLangPicker, setShowLangPicker] = useState(false);
  const actionRef = useRef(null);

  useEffect(() => {
    if (!showLangPicker) return;
    const handler = (e) => {
      if (actionRef.current && !actionRef.current.contains(e.target)) setShowLangPicker(false);
    };
    document.addEventListener("click", handler);
    return () => document.removeEventListener("click", handler);
  }, [showLangPicker]);

  return (
    <div className="flex items-center gap-3 p-3 rounded-lg bg-slate-50 border border-slate-200">
      <div className="flex items-center gap-2">
        <div className="flex h-5 w-5 items-center justify-center rounded-full bg-blue-600">
          <Sparkles className="h-2.5 w-2.5 text-white" />
        </div>
        <span className="text-xs font-medium text-slate-700">{t?.actionLabel || "アクション"}</span>
      </div>
      <div className="flex items-center gap-2">
        {/* Translate */}
        <div className="relative" ref={actionRef}>
          <Button
            variant="outline" size="sm"
            onClick={(e) => { e.stopPropagation(); setShowLangPicker((v) => !v); }}
            disabled={actionLoading}
            className="px-2.5 py-1 rounded-md text-xs h-7 flex items-center gap-1 bg-white border-slate-300 text-slate-700 hover:bg-slate-50"
          >
            <Languages className="h-3 w-3" />
            {t?.actionTranslate || "翻訳"}
          </Button>
          {showLangPicker && (
            <div className="absolute left-0 bottom-full z-50 mb-1 min-w-32 rounded-md border border-slate-200 bg-white p-1 shadow-lg">
              {Object.keys(languageCodeToLabel).map((code) => (
                <button
                  key={code}
                  className="block w-full rounded-sm p-1.5 text-left text-xs hover:bg-slate-50 text-slate-700"
                  onClick={() => { onApplyAction("translate", code); setShowLangPicker(false); }}
                  disabled={actionLoading}
                >
                  {languageCodeToLabel[code]}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Summarize */}
        <Button
          variant="outline" size="sm"
          onClick={() => onApplyAction("summarize")}
          disabled={actionLoading}
          className="px-2.5 py-1 rounded-md text-xs h-7 flex items-center gap-1 bg-white border-slate-300 text-slate-700 hover:bg-slate-50"
        >
          <FileBarChart className="h-3 w-3" />
          {t?.actionSummarize || "要約"}
        </Button>

        {/* Simplify */}
        <Button
          variant="outline" size="sm"
          onClick={() => onApplyAction("simplify")}
          disabled={actionLoading}
          className="px-2.5 py-1 rounded-md text-xs h-7 flex items-center gap-1 bg-white border-slate-300 text-slate-700 hover:bg-slate-50"
        >
          <Sparkles className="h-3 w-3" />
          {t?.actionSimplify || "わかりやすく"}
        </Button>
      </div>
    </div>
  );
}
