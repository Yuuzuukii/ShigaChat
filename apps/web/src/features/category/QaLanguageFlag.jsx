import React from "react";
const joinClassNames = (...classes) => classes.filter(Boolean).join(" ");

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
      className={joinClassNames(
        "fi fis inline-block rounded-[0.2rem] text-lg",
        `fi-${countryCode}`,
        className
      )}
    />
  );
}
