import { API_BASE_URL, languageCodeToLabel } from "../config/constants";

// Update user preferred language on server and refresh token/state.
// Signature backward-compatible:
// - updateUserLanguage(code, setUser)
// - updateUserLanguage(code, setUser, setToken)
export const updateUserLanguage = async (newLanguageCode, setUser, setToken) => {
  const newLanguageName = languageCodeToLabel[newLanguageCode];

  try {
    const response = await fetch(
      `${API_BASE_URL}/user/change_language?language=${encodeURIComponent(newLanguageName)}`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${localStorage.getItem("token")}`,
        },
      }
    );

    if (!response.ok) {
      throw new Error("言語の更新に失敗しました");
    }

    const data = await response.json();

    // 1) 先にトークンを最新化（依存エフェクトで401を避ける）
    if (data.access_token) {
      localStorage.setItem("token", data.access_token);
      if (typeof setToken === "function") {
        setToken(data.access_token);
      }
      // 既存のリスナー互換
      window.dispatchEvent(new Event("tokenUpdated"));
    }

    // 2) ユーザーの言語を更新
    if (typeof setUser === "function") {
      setUser((prevUser) => ({
        ...prevUser,
        spokenLanguage: newLanguageName,
      }));
    }
  } catch (error) {
    console.error("❌ 言語の更新に失敗:", error);
  }
};
