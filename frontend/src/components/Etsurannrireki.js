import React, { useState, useEffect, useContext, useRef } from "react";
import { UserContext } from "../UserContext";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import { updateUserLanguage } from "../utils/language";
import {
  API_BASE_URL,
  translations,
  languageCodeToId,
  languageLabelToCode,
  categoryList,
} from "../config/constants";
import {
  fetchNotifications,
  handleNotificationClick,
  handleNotificationMove,
  handleGlobalNotificationMove
} from "../utils/notifications";
import "./Etsurannrireki.css";

function Etsurannrireki() {
  const [viewedHistory, setViewedHistory] = useState([]);
  const [errorMessage, setErrorMessage] = useState("");
  const [language, setLanguage] = useState("ja");
  const [expandedQuestionId, setExpandedQuestionId] = useState(null); // 展開中の質問ID
  const navigate = useNavigate();
  const { user, setUser, token, setToken, fetchUser } = useContext(UserContext);
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
      fetchViewedHistory();
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
    setLanguage(newLanguage); // 🔄 言語を更新
    const success = await updateUserLanguage(newLanguage, setUser); // 🔄 サーバーに反映
    if (success) {
      fetchViewedHistory(); // 🔄 履歴を更新
    }
  };

  const fetchViewedHistory = async () => {
    try {
      if (!token) {
        setErrorMessage(t.errorLogin);
        navigate("/new");
        return;
      }

      const languageMapping = {
        en: 2,
        ja: 1,
        vi: 3,
        zh: 4,
        ko: 5,
      };

      const response = await axios.get(
        `${API_BASE_URL}/history/get_viewed_question?language_id=${languageMapping[language]}`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      const uniqueHistory = response.data.map((item) => {
        const uniqueAnswers = item.answers.filter(
          (answer, index, self) =>
            index === self.findIndex((a) => a.answer_id === answer.answer_id)
        );
        return {
          ...item,
          answers: uniqueAnswers,
        };
      });

      setViewedHistory(uniqueHistory);
    } catch (error) {
      setErrorMessage(t.errorFetch);
    }
  };

  const clearViewedHistory = async () => {
    const isConfirmed = window.confirm("本当に閲覧履歴を削除しますか？");
    if (!isConfirmed) return;

    try {
      const response = await axios.delete(`${API_BASE_URL}/history/clear_history`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (response.status === 200) {
        setViewedHistory([]);
        setErrorMessage(""); // エラーメッセージをクリア
      } else {
        throw new Error("Failed to clear history.");
      }
    } catch (error) {
      console.error("閲覧履歴の削除に失敗しました:", error.message);
      setErrorMessage(t.errorFetch);
    }
  };

  const toggleExpand = (questionId) => {
    setExpandedQuestionId((prevId) => (prevId === questionId ? null : questionId));
  };

  const userData = localStorage.getItem("user");
  const userId = userData ? JSON.parse(userData).id : null;

  return (
    <div className="view-history-container">
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

      <h2 className="keyword-k">{t.viewedHistory}</h2>
      <div className="button-container">
        <button className="clear-history-button" onClick={clearViewedHistory}>
          {t.clear}
        </button>
      </div>

      <div className="history-list">
        {viewedHistory.length > 0 ? (
          viewedHistory.map((item) => (
            <div key={item.question_id} className="history-item">
              <div
                className="history-question"
                onClick={() => toggleExpand(item.question_id)}
              >
                <div className="question-header">
                  <div className="history-question-text">
                    {item.質問}
                  </div>
                  <div className="category-current">
                    {t.category}:{" "}
                    {categoryList?.find((cat) => cat.id === item.category_id)?.name?.[language] ||
                      categoryList?.find((cat) => cat.id === item.category_id)?.name?.ja ||
                      t.unknownCategory}
                  </div>
                  {item.title === "official" && (
                    <span className="official-badge">{t.official}</span>
                  )}
                </div>
                <div className="history-date" style={{ textAlign: "right" }}>
                  {`${t.viewDate} ${new Date(item.time).toLocaleString()}`}
                </div>
              </div>
              {expandedQuestionId === item.question_id && (
                <div className="history-answers">
                  {item.answers.map((answer, index) => (
                    <div key={index} className="history-answer">
                      <strong>{t.answer}</strong> {answer.回答}
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))
        ) : (
          <p className="no-history">{t.noHistory}</p>
        )}
      </div>

      {errorMessage && <p className="error-message">{errorMessage}</p>}
    </div>
  );
}

export default Etsurannrireki;