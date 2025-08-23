import React, { createContext, useState, useEffect } from "react";

export const UserContext = createContext();

const API_BASE_URL = "http://localhost:8000";


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
          setToken(null);
          localStorage.removeItem("token");
          localStorage.removeItem("user");
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
          localStorage.setItem("user", JSON.stringify(userData)); // 🔽 ユーザー情報を保存
        } else {
          throw new Error("ユーザー情報が不完全です");
        }
      })
      .catch((error) => {
        console.error("❌ ユーザー情報の取得に失敗:", error);
        setUser(null);
        localStorage.removeItem("user"); // 🔽 取得に失敗した場合は削除
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
