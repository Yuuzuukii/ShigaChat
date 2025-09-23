import React, { createContext, useState, useEffect } from "react";
import { API_BASE_URL } from "./config/constants";

export const UserContext = createContext();


export const UserProvider = ({ children }) => {
  const [user, setUser] = useState(() => {
    // 🔽 初回レンダリング時に localStorage からユーザー情報を取得
    const storedUser = localStorage.getItem("user");
    return storedUser ? JSON.parse(storedUser) : null;
  });

  const [token, setToken] = useState(() => localStorage.getItem("token") || null);
  const [language, setLanguage] = useState("ja");
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
          // トークン切れの場合は現在のページをリダイレクト用に保存
          const currentPath = window.location?.pathname + window.location?.search;
          if (currentPath && currentPath !== "/new" && currentPath !== "/") {
            localStorage.setItem("redirectAfterLogin", currentPath);
          }
          
          setToken(null);
          localStorage.removeItem("token");
          localStorage.removeItem("user");
          
          // トークン切れイベントを発火
          if (typeof window !== "undefined") {
            window.dispatchEvent(new CustomEvent("tokenExpired", { 
              detail: { redirectPath: currentPath } 
            }));
          }
          
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
          setLanguage(data.spoken_language);
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
    fetchUser(token);
  }, [token]);

  useEffect(() => {
    if (user && user.spokenLanguage) {
      setLanguage(user.spokenLanguage);
    }
  }, [user]);

  const logout = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    setToken(null);
    setUser(null);
    setLanguage("ja");

    if (typeof window !== "undefined") {
      window.dispatchEvent(new Event("userLoggedOut"));
    }
  };

  return (
    // UserProvider の return のところ
    <UserContext.Provider
      value={{
        user,
        token,
        isLoading,
        language,
        setLanguage,
        setUser,
        setToken,
        logout,
        fetchUser, // 🔽 追加！
      }}
    >
      {children}
    </UserContext.Provider>
  );
};
