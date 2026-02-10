/**
 * LanguageSelector - 言語選択プルダウン（共通）
 */
import React from "react";
import { Globe } from "lucide-react";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "../ui/select";
import { languageOptions } from "../../config/i18n";

export default function LanguageSelector({ value, onChange, size = "default", className = "" }) {
  const sizes = {
    small: "h-8 w-[140px] text-xs",
    default: "h-10 w-[160px] text-sm",
  };

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <Globe className={`text-blue-600 ${size === "small" ? "h-4 w-4" : "h-5 w-5"}`} />
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className={`${sizes[size]} rounded-lg border-blue-200/80 bg-white/80 px-2 text-blue-700 shadow-sm backdrop-blur`}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {languageOptions.map((opt) => (
            <SelectItem key={opt.code} value={opt.code}>{opt.label}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
