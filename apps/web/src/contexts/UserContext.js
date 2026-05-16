/**
 * UserContext - 認証状態のグローバル管理
 */
import React, { createContext, useState, useEffect } from "react";
import { API_BASE_URL, BASE_PATH } from "../config/constants";
import { translations, languageLabelToCode } from "../config/i18n";
import { reset401Flag } from "../api/apiClient";

export const UserContext = createContext();

/**
 * セッション切れ時にログインページへ一度だけリダイレクトする。
 * Router 外（UserProvider）から呼ばれるため navigate ではなく
 * window.location を使い、フラグで多重発火を防ぐ。
 */
let _redirectingToLogin = false;
function forceRedirectToLogin() {
  if (_redirectingToLogin) return;
  _redirectingToLogin = true;
  console.warn("🔒 トークンが切れました。ログインページにリダイレクトします。");
  try {
    localStorage.removeItem("redirectAfterLogin");
  } catch {}
  // BASE_PATH を考慮して直接遷移
  const loginPath = (BASE_PATH === "/" ? "" : BASE_PATH.replace(/\/+$/, "")) + "/login";
  window.location.replace(loginPath);
}
/** ログイン成功時にフラグをリセットする */
export function resetRedirectFlag() {
  _redirectingToLogin = false;
}
/** window.location リダイレクトが進行中か */
export function isForceRedirecting() {
  return _redirectingToLogin;
}

function getLanguageCode(user) {
  return languageLabelToCode[user?.spokenLanguage] || "en";
}

export const UserProvider = ({ children }) => {
  const [user, setUser] = useState(() => {
    const storedUser = localStorage.getItem("user");
    return storedUser ? JSON.parse(storedUser) : null;
  });

  const [token, setToken] = useState(() => localStorage.getItem("token") || null);
  const [isLoading, setIsLoading] = useState(true);

  const fetchUser = (currentToken) => {
    if (!currentToken) {
      setUser(null);
      setIsLoading(false);
      return;
    }

    fetch(`${API_BASE_URL}/user/current_user`, {
      headers: { Authorization: `Bearer ${currentToken}` },
    })
      .then((res) => {
        if (res.status === 401) {
          console.warn("⚠️ 401 Unauthorized - トークンを削除");
          setToken(null);
          localStorage.removeItem("token");
          localStorage.removeItem("user");
          setUser(null);
          forceRedirectToLogin();
          throw new Error("認証エラー: トークンが無効です");
        }
        return res.json();
      })
      .then((data) => {
        if (data.id) {
          const userData = {
            id: data.id,
            nickname: data.name,
            spokenLanguage: data.spoken_language,
          };
          setUser(userData);
          localStorage.setItem("user", JSON.stringify(userData));
        } else {
          throw new Error("ユーザー情報が不完全です");
        }
      })
      .catch((error) => {
        console.error("❌ ユーザー情報の取得に失敗:", error);
        setUser(null);
        localStorage.removeItem("user");
      })
      .finally(() => {
        setIsLoading(false);
      });
  };

  useEffect(() => {
    if (!token) {
      setIsLoading(false);
      return;
    }
    // 新しいトークンがセットされた → リダイレクトフラグをリセット
    resetRedirectFlag();
    reset401Flag();
    fetchUser(token);
  }, [token]);

  const logout = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    setToken(null);
    setUser(null);
    if (typeof window !== "undefined") window.dispatchEvent(new Event("userLoggedOut"));
  };

  const language = getLanguageCode(user);
  const t = translations[language] || translations.en;

  return (
    <UserContext.Provider
      value={{
        user,
        token,
        isLoading,
        language,
        t,
        setUser,
        setToken,
        logout,
        fetchUser,
        redirectToLogin: forceRedirectToLogin,
      }}
    >
      {children}
    </UserContext.Provider>
  );
};
