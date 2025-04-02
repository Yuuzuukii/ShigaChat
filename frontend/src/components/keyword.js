import React, { useState, useEffect, useContext, useRef } from "react";
import { UserContext } from "../UserContext"; // ユーザー情報を取得
import { useNavigate } from "react-router-dom";
import { updateUserLanguage } from "../utils/language";
import {
  API_BASE_URL,
  translations,
  categoryList,
  languageLabelToCode,
} from "../config/constants";
import {
  fetchNotifications,
  handleNotificationClick,
  handleNotificationMove,
  handleGlobalNotificationMove
} from "../utils/notifications";
import "./Keyword.css";

function Keyword() {
  const [keyword, setKeyword] = useState(""); // キーワードの状態を管理
  const [results, setResults] = useState([]); // 検索結果を保存
  const [language, setLanguage] = useState("ja"); // 言語の状態を管理
  const [visibleAnswerId, setVisibleAnswerId] = useState(null); // 表示する回答を管理
  const { user, setUser, token, setToken, fetchUser, } = useContext(UserContext); // UserContextからユーザー情報を取得
  const [errorMessage, setErrorMessage] = useState(""); // エラーメッセージ
  const navigate = useNavigate(); // 画面遷移用
  const [notifications, setNotifications] = useState([]);
  const [showPopup, setShowPopup] = useState(false); // ポップアップの表示制御
  const [unreadCount, setUnreadCount] = useState(0);
  const [globalNotifications, setGlobalNotifications] = useState([]); // 全体通知を管理
  const [activeTab, setActiveTab] = useState("personal"); // "personal" または "global"
  const [isNotifLoading, setIsNotifLoading] = useState(true);
  const popupRef = useRef(null);

  const t = translations[language];

  useEffect(() => {
      if (user?.spokenLanguage) {
        const code = languageLabelToCode[user.spokenLanguage];
        if (code) {
          setLanguage(code);
        } else {
          console.warn("❗未対応のspokenLanguage:", user.spokenLanguage);
          setLanguage("ja"); // fallback
        }
      }
    }, [user]);  

  useEffect(() => {
      if (user?.id && token) {
        //console.log("✅ fetchNotifications を開始:", user?.id);
        fetchNotifications({
          language,
          token,
          userId: user.id,
          setNotifications,
          setGlobalNotifications,
          setUnreadCount,
        }).finally(() => setIsNotifLoading(false));
      } else {
        //console.log("⚠️ user.id または token が未定義のため fetchNotifications をスキップ");
      }
    }, [user, token]);

  useEffect(() => {
      if (user) {
        fetchNotifications({ language, token, userId, setNotifications, setGlobalNotifications, setUnreadCount });
      }
    }, [language]);

  useEffect(() => {
      //console.log("UserContext 更新後のユーザー情報:", user);
      if (user === null) {
        navigate("/new");
      }
      const handleTokenUpdate = () => {
        const latestToken = localStorage.getItem("token");
        if (latestToken) {
          fetchUser(latestToken); // ✅ 正常に動作！
        }
      };
      window.addEventListener("tokenUpdated", handleTokenUpdate);
      return () => {
        window.removeEventListener("tokenUpdated", handleTokenUpdate);
      };
    }, [user, navigate, fetchUser]); // ← 依存に fetchUser を追加

  useEffect(() => {
      if (showPopup) {
        document.addEventListener("click", handleClickOutside);
      } else {
        document.removeEventListener("click", handleClickOutside);
      }
      return () => document.removeEventListener("click", handleClickOutside);
    }, [showPopup]);
  
  const handleClickOutside = (event) => {
    if (popupRef.current && !popupRef.current.contains(event.target)) {
      setShowPopup(false);
    }
  };

  const onNotificationClick = () => {
    handleNotificationClick({
      showPopup,
      setShowPopup,
      language,
      token,
      userId,
      setNotifications,
      setGlobalNotifications,
      setUnreadCount,
    });
  };

  const onNotificationMove = (notification) => {
    handleNotificationMove(notification, navigate, token, () => {
      fetchNotifications({ language, token, userId, setNotifications, setGlobalNotifications, setUnreadCount });
    });
  };

  const onGlobalNotificationMove = (notification) => {
    handleGlobalNotificationMove(notification, navigate, token, () => {
      fetchNotifications({ language, token, userId, setNotifications, setGlobalNotifications, setUnreadCount });
    });
  };

  const handleLanguageChange = async (event) => {
    const newLanguage = event.target.value;
    setLanguage(newLanguage); // ローカルの言語設定を変更
    setKeyword(""); // キーワードをクリア
    setResults([]); // 検索結果をクリア
    await updateUserLanguage(newLanguage, setUser); // サーバー側の言語設定を更新
  };

  const handleSearch = async () => {
    if (!token) {
      setErrorMessage(t.errorLogin);
      navigate("/new");
      return;
    }
    if (!keyword.trim()) {
      alert(t.enterKeyword);
      return;
    }

    try {
      const token = localStorage.getItem("token");
      if (!token) {
        alert(t.errorLogin);
        return;
      }

      const response = await fetch(
        `${API_BASE_URL}/keyword/search_with_language?keywords=${encodeURIComponent(keyword)}`,
        {
          headers: {
            Authorization: `Bearer ${token}`, // トークンをヘッダーに追加
          },
        }
      );

      if (!response.ok) {
        const errorData = await response.json();
        console.error("サーバーエラー:", errorData);
        throw new Error(errorData.detail || t.noResults);
      }

      const data = await response.json();
      //console.log("サーバーからのレスポンス:", data);

      // 配列形式のレスポンスに対応
      if (Array.isArray(data)) {
        setResults(data);
      } else {
        console.error("予期しないレスポンス形式:", data);
        setResults([]);
      }
    } catch (error) {
      console.error("エラー:", error.message);
      alert(t.keyworderror);
    }
  };

  const addHistory = async (questionId) => {
    if (!questionId) {
      console.error("送信する質問IDが存在しません:", questionId);
      return;
    }
    try {
      const response = await fetch(`${API_BASE_URL}/history/add_history`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ question_id: questionId }),
      });
      const responseData = await response.json();
    } catch (error) {
      console.error("履歴追加中にエラー:", error);
    }
  };

  const toggleAnswer = (questionId) => {
    if (!questionId) {
      console.error("質問IDが取得できません:", questionId);
      return;
    }
    //console.log("質問ID:", questionId);
    setVisibleAnswerId((prevId) => (prevId === questionId ? null : questionId));
    addHistory(questionId);
  };

  const highlightMatchedWords = (text) => {
    if (!text) return "";
    return text.replace(/<strong>(.*?)<\/strong>/g, '<span class="highlighted">$1</span>');
  };

  const userData = localStorage.getItem("user");
  const userId = userData ? JSON.parse(userData).id : null;

  return (
    <div className="keyword-container">
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
        <h1>Shiga Chat</h1>
        {/* ユーザーアイコンと通知をまとめたラッパー */}
        <div className="user-notification-wrapper">
          {/* 🔔 通知ボタン（画像版） */}
          <div className={`notification-container ${showPopup ? "show" : ""}`}>
            {/* 🔔 通知ボタン */}
            <button className="notification-button" onClick={onNotificationClick}>
              <img src="./bell.png" alt="通知" className="notification-icon" />
              {unreadCount > 0 && <span className="badge">{unreadCount}</span>}
            </button>

            {/* 🔔 通知ポップアップ */}
            {showPopup && (
              <div className="notification-popup" ref={popupRef}>
                {/* タブ切り替えボタン */}
                <div className="tabs">
                  <button onClick={() => setActiveTab("personal")} className={activeTab === "personal" ? "active" : ""}>
                    {t.personal}
                  </button>
                  <button onClick={() => setActiveTab("global")} className={activeTab === "global" ? "active" : ""}>
                    {t.global}
                  </button>
                </div>

                <div className="notifications-list">
                  {/* 🔹 個人通知リスト */}
                  {activeTab === "personal" && (
                    notifications.length > 0 ? (
                      notifications.map((notification) => (
                        <div
                          key={notification.id}
                          className={`notification-item ${notification.is_read ? "read" : "unread"}`}
                          onClick={() => onNotificationMove(notification)}
                        >
                          {notification.message}
                          <span className="time">{new Date(notification.time).toLocaleString()}</span>
                        </div>
                      ))
                    ) : (
                      <p>{t.noNotifications}</p> // 🔹 個人通知がない場合のメッセージ
                    )
                  )}

                  {/* 🔹 全体通知リスト */}
                  {activeTab === "global" && (
                    globalNotifications.length > 0 ? (
                      globalNotifications.map((notification) => (
                        <div
                          key={notification.id}
                          className={`notification-item ${Array.isArray(notification.read_users) && notification.read_users.includes(userId) ? "read" : "unread"}`}
                          onClick={() => onGlobalNotificationMove(notification)}
                        >
                          {notification.message}
                          <span className="time">{new Date(notification.time).toLocaleString()}</span>
                        </div>
                      ))
                    ) : (
                      <p>{t.noNotifications}</p> // 🔹 全体通知がない場合のメッセージ
                    )
                  )}
                </div>
              </div>
            )}
          </div>
          {/* ユーザー名 */}
          <div className="userIcon">
            {user ? `${user.nickname} ` : t.guest}
          </div>
        </div>
      </header>

      <div className="search-bar">
        <h1 className="keyword-k">{t.keywordSearch}</h1>
        <input
          type="text"
          placeholder={t.enterKeyword}
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
        />
        <p></p>
        <button onClick={handleSearch}>{t.search}</button>
      </div>
      <div className="question-list">
        {results.length > 0 ? (
          results.map((question) => (
            <div
              className="question-item"
              id={`question-${question.question_id}`}
              key={question.question_id}
              onClick={() => toggleAnswer(question.question_id)}
              style={{ cursor: "pointer" }}
            >
              <div className="question-header">
                <div className="question-text">
                  <p dangerouslySetInnerHTML={{ __html: highlightMatchedWords(question.question_text) || t.loading }} />
                </div>
                {question?.title === "official" && (
                  <span className="official-badge">{t.official}</span>
                )}
              </div>

              <div className="category-current">
                {t.category}:{" "}
                {categoryList?.find((cat) => cat.id === question.category_id)?.name?.[language] ||
                  categoryList?.find((cat) => cat.id === question.category_id)?.name?.ja ||
                  t.unknownCategory}
              </div>

              <div className="question-date" style={{ textAlign: "right" }}>
                {t.questionDate}
                {new Date(question.update_time.replace(" ", "T")).toLocaleString()}
              </div>

              {visibleAnswerId === question.question_id && (
                <div className="answer-section">
                  <strong>{t.answer}</strong>
                  <p dangerouslySetInnerHTML={{ __html: highlightMatchedWords(question.answer_text) || t.loading }} />
                </div>
              )}
            </div>
          ))
        ) : (
          <p className="no-questions">{t.noQuestions}</p>
        )}
      </div>
    </div>
  );
}

export default Keyword;
