import React from "react";
import { cn } from "../../lib/utils";

const languageToCountry = {
  ja: "jp",
  en: "gb",
  zh: "cn",
  vi: "vn",
  ko: "kr",
  pt: "pt",
  es: "es",
  tl: "ph",
  id: "id",
};

export function FlagIcon({ languageCode, className = "", title = "" }) {
  const countryCode = languageToCountry[languageCode];
  if (!countryCode) return null;

  return (
    <span
      aria-hidden="true"
      title={title}
      className={cn(
        "fi fis inline-block rounded-[0.2rem] shadow-sm ring-1 ring-black/10",
        `fi-${countryCode}`,
        className
      )}
    />
  );
}
