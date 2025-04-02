import { API_BASE_URL, languageCodeToLabel } from "../config/constants";

export const updateUserLanguage = async (newLanguageCode, setUser) => {
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
      localStorage.setItem("token", data.access_token);
  
      // UserContext の spokenLanguage を更新
      setUser((prevUser) => ({
        ...prevUser,
        spokenLanguage: newLanguageName,
      }));
  
      // トークン更新通知
      window.dispatchEvent(new Event("tokenUpdated"));
    } catch (error) {
      console.error("❌ 言語の更新に失敗:", error);
    }
  };