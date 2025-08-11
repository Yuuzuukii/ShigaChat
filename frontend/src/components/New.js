import React, { useState, useEffect, useContext } from "react";
import axios from "axios";
import { useNavigate } from "react-router-dom";
import { UserContext } from "../UserContext"; // ユーザー情報を管理
import {
  API_BASE_URL,
  translations,
  languageCodeToId,
  languageLabelToCode,
} from "../config/constants";
import "./New.css"; // CSSファイルをインポート

function New() {
  const [nickname, setNickname] = useState(""); // ニックネームの状態管理
  const [password, setPassword] = useState("");
  const [language, setLanguage] = useState("en"); // 言語
  const [errorMessage, setErrorMessage] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const { user, token, setToken, setUser } = useContext(UserContext); // グローバルなユーザー情報の保存用
  const navigate = useNavigate(); // 画面遷移用

  const t = translations[language]; // 現在選択されている言語の文字列を取得

  useEffect(() => {
    if (user) {
      const redirectPath = localStorage.getItem("redirectAfterLogin") || "/home";
      localStorage.removeItem("redirectAfterLogin"); // クリア
      navigate(redirectPath);
    }
  }, [user, navigate]);

  const handleLogin = async () => {
    if (!nickname || !password) {
      setErrorMessage(t.errorEmptyFields);
      return;
    }

    try {
      const response = await axios.post(
        `${API_BASE_URL}/user/token`,
        new URLSearchParams({ username: nickname, password }),
        { headers: { "Content-Type": "application/x-www-form-urlencoded" } }
      );

      const { access_token } = response.data;
      localStorage.setItem("token", access_token);
      setToken(access_token);  // グローバルなトークンを更新

      // サーバーから `current_user` を取得
      const userResponse = await axios.get(`${API_BASE_URL}/user/current_user`, {
        headers: { Authorization: `Bearer ${access_token}` },
      });

      const userData = userResponse.data;
      //console.log("ログイン成功: ユーザーデータ", userData);  // ✅ ユーザー情報を確認

      setUser({
        id: userData.id,
        nickname: userData.nickname,
        spokenLanguage: userData.spoken_language,
        isAdmin: userData.isAdmin === 1,
      })

      navigate("/home");  // ホーム画面にリダイレクト
    } catch (error) {
      if (error.response?.status === 401) {
        setErrorMessage(t.errorInvalidLogin);
      } else {
        setErrorMessage(t.errorServer);
      }
      console.error("ログインエラー:", error);  // ✅ エラーログを確認
    }
  };

  const handleLanguageChange = async (event) => {
    const newLanguageCode = event.target.value;
    setLanguage(newLanguageCode); // 表示を即時更新
  };

  return (
    <div className="container-new">
      <header className="header">
        <div className="language-wrapper">
          <img src="./globe.png" alt="言語" className="globe-icon" />
          <select className="languageSelector" onChange={handleLanguageChange} value={language}>
            <option value="ja">日本語</option>
            <option value="en">English</option>
            <option value="zh">中文</option>
            <option value="vi">Tiếng Việt</option>
            <option value="ko">한국어</option>
          </select>
        </div>
        <h1 className="title">ShigaChat</h1>
      </header>

      <div className="login-box">
        <h2 className="kotoba">{t.welcome}</h2>
        <form onSubmit={(e) => e.preventDefault()}>
          <div className="form-group">
            <label htmlFor="nickname">{t.nickname}:</label>
            <input
              type="text"
              id="nickname"
              placeholder={t.nickname}
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
            />
          </div>

          <div className="form-group">
            <label htmlFor="password">{t.password}:</label>
            <input
              type="password"
              id="password"
              placeholder={t.password}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>

          <button type="button" className="btn btn-login" onClick={handleLogin}>
            {t.login}
          </button>
        </form>
        {errorMessage && <p style={{ color: "red" }}>{errorMessage}</p>}

        <div className="register-link">
          <p>{t.registerPrompt}</p>
          <button
            type="button"
            className="btn btn-register"
            onClick={() => navigate("/shinki")}
          >
            {t.signUp}
          </button>
        </div>
      </div>
    </div>
  );
}

export default New;
