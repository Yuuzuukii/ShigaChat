/**
 * useLanguage - 言語管理フック
 * UserContextのspokenLanguageからコードを算出し、翻訳オブジェクトを返す
 */
import { useState, useEffect, useCallback, useContext } from "react";
import { UserContext } from "../contexts/UserContext";
import { translations, languageLabelToCode, languageCodeToLabel } from "../config/i18n";
import { postChangeLanguage } from "../services/api";

function getUserLanguageCode(user) {
  if (!user?.spokenLanguage) return null;
  return languageLabelToCode[user.spokenLanguage] || null;
}

export function useLanguage() {
  const { user, setUser, setToken } = useContext(UserContext);
  const spokenLanguage = user?.spokenLanguage || null;

  const [language, setLanguageState] = useState(() => {
    // 認証後はユーザー設定を最優先。認証前のみ localStorage を参照する。
    const userCode = getUserLanguageCode({ spokenLanguage });
    if (userCode) return userCode;

    const stored = localStorage.getItem("shigachat_lang");
    if (stored && translations[stored]) return stored;

    return "en";
  });

  // ユーザープロファイル変更を追跡
  useEffect(() => {
    const userCode = getUserLanguageCode({ spokenLanguage });
    if (userCode) {
      if (userCode !== language) {
        setLanguageState(userCode);
      }
      try {
        localStorage.setItem("shigachat_lang", userCode);
      } catch {}
    }
  }, [spokenLanguage, language]);

  // グローバルイベントで同期
  useEffect(() => {
    const handler = (e) => {
      if (getUserLanguageCode({ spokenLanguage })) return;

      const code = e.detail?.code;
      if (code && translations[code]) setLanguageState(code);
    };
    window.addEventListener("languageChanged", handler);
    return () => window.removeEventListener("languageChanged", handler);
  }, [spokenLanguage]);

  // First-time bootstrap: if language is not set, persist English default.
  useEffect(() => {
    if (getUserLanguageCode({ spokenLanguage })) return;

    try {
      const stored = localStorage.getItem("shigachat_lang");
      if (!stored) {
        localStorage.setItem("shigachat_lang", "en");
        setLanguageState("en");
      }
    } catch {}
  }, [spokenLanguage]);

  const t = translations[language] || translations.en;

  /**
   * UIの言語を切り替え + サーバーにも反映
   */
  const changeLanguage = useCallback(
    async (newCode) => {
      if (!translations[newCode]) return;
      setLanguageState(newCode);
      try {
        localStorage.setItem("shigachat_lang", newCode);
      } catch {}

      // サーバーに言語変更を通知
      const newLabel = languageCodeToLabel[newCode];
      if (!newLabel) return;

      try {
        const res = await postChangeLanguage(newLabel);
        if (!res.ok) throw new Error();
        const data = await res.json();
        if (data.access_token) {
          localStorage.setItem("token", data.access_token);
          if (setToken) setToken(data.access_token);
          window.dispatchEvent(new Event("tokenUpdated"));
        }
        if (setUser) {
          setUser((prev) => ({ ...prev, spokenLanguage: newLabel }));
        }
      } catch (error) {
        console.error("❌ 言語の更新に失敗:", error);
      }

      try {
        window.dispatchEvent(
          new CustomEvent("languageChanged", { detail: { code: newCode, label: newLabel } })
        );
      } catch {}
    },
    [setUser, setToken]
  );

  /**
   * 認証前の画面用: ローカルのみで言語を変更（サーバー通信なし）
   */
  const changeLanguageLocal = useCallback((newCode) => {
    if (!translations[newCode]) return;
    setLanguageState(newCode);
    try {
      localStorage.setItem("shigachat_lang", newCode);
    } catch {}
  }, []);

  return { language, t, changeLanguage, changeLanguageLocal };
}
