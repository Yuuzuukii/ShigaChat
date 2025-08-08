import React, { useState, useContext, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { UserContext } from "../../UserContext";
import { updateUserLanguage } from "../../utils/language";
import {
  API_BASE_URL,
  translations,
  languageLabelToCode,
  categoryList,
} from "../../config/constants";
import {
  fetchNotifications,
  handleNotificationClick,
  handleNotificationMove,
  handleGlobalNotificationMove,
} from "../../utils/notifications";
import "./Question_Admin.css";

const Question_Admin = () => {
  const navigate = useNavigate();
  const { user, token, fetchUser } = useContext(UserContext);
  const [isCategoryModalOpen, setIsCategoryModalOpen] = useState(false);
  const [selectedCategoryId, setSelectedCategoryId] = useState(null);
  const [selectedCategoryName, setSelectedCategoryName] = useState(null);
  const [content, setContent] = useState("");
  const [answerText, setAnswerText] = useState("");
  const [language, setLanguage] = useState("ja");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [notifications, setNotifications] = useState([]);
  const [showPopup, setShowPopup] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [globalNotifications, setGlobalNotifications] = useState([]);
  const [activeTab, setActiveTab] = useState("personal");
  const popupRef = useRef(null);

  const t = translations[language];

  useEffect(() => {
    if (user?.spokenLanguage) {
      const code = languageLabelToCode[user.spokenLanguage];
      setLanguage(code || "ja");
    }
  }, [user]);

  useEffect(() => {
    if (user?.id && token) {
      fetchNotifications({
        language,
        token,
        userId: user.id,
        setNotifications,
        setGlobalNotifications,
        setUnreadCount,
      });
    }
  }, [user, token, language]);

  useEffect(() => {
    if (user === null) navigate("/new");
    const handleTokenUpdate = () => {
      const latestToken = localStorage.getItem("token");
      if (latestToken) fetchUser(latestToken);
    };
    window.addEventListener("tokenUpdated", handleTokenUpdate);
    return () => window.removeEventListener("tokenUpdated", handleTokenUpdate);
  }, [user, navigate, fetchUser]);

  useEffect(() => {
    if (showPopup) document.addEventListener("click", handleClickOutside);
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
      userId: user?.id,
      setNotifications,
      setGlobalNotifications,
      setUnreadCount,
    });
  };

  const onNotificationMove = (notification) => {
    handleNotificationMove(notification, navigate, token, () => {
      fetchNotifications({ language, token, userId: user?.id, setNotifications, setGlobalNotifications, setUnreadCount });
    });
  };

  const onGlobalNotificationMove = (notification) => {
    handleGlobalNotificationMove(notification, navigate, token, () => {
      fetchNotifications({ language, token, userId: user?.id, setNotifications, setGlobalNotifications, setUnreadCount });
    });
  };

  const handleLanguageChange = (event) => {
    const newLanguage = event.target.value;
    setLanguage(newLanguage);
    updateUserLanguage(newLanguage);
  };

  const openCategoryModal = () => setIsCategoryModalOpen(true);
  const closeCategoryModal = () => setIsCategoryModalOpen(false);

  const handleChangeCategory = (id, name) => {
    setSelectedCategoryId(id);
    setSelectedCategoryName(name);
    closeCategoryModal();
  };

  const handleRegisterQuestion = async () => {
    if (!content.trim()) return setErrorMessage(t.questionerror);
    if (!answerText.trim()) return setErrorMessage(t.answererror);
    if (!selectedCategoryId) return setErrorMessage(t.selectcategory);

    setIsSubmitting(true);
    setErrorMessage("");

    try {
      const response = await fetch(`${API_BASE_URL}/admin/register_question`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          category_id: selectedCategoryId,
          content,
          answer_text: answerText,
          public: true,
        }),

      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || "QA登録に失敗しました。")
      }

      alert(t.register);
      clearForm();
    } catch (error) {
      console.error("QA登録エラー:", error);
      setErrorMessage(error.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const clearForm = () => {
    setContent("");
    setAnswerText("");
    setSelectedCategoryId(null);
    setSelectedCategoryName("");
  };

  const userData = localStorage.getItem("user");
  const userId = userData ? JSON.parse(userData).id : null;

  return (
    <div className="admin-container-kategori">
      <header className="header">
        <div className="language-wrapper">
          <img src="./../globe.png" alt="言語" className="globe-icon" />
          <select className="languageSelector" onChange={handleLanguageChange} value={language}>
            <option value="ja">日本語</option>
            <option value="en">English</option>
            <option value="zh">中文</option>
            <option value="vi">Tiếng Việt</option>
            <option value="ko">한국어</option>
          </select>
        </div>
        <h1>Shiga Chat</h1>
        <div className="user-notification-wrapper">
          <div className={`notification-container ${showPopup ? "show" : ""}`}>
            <button className="notification-button" onClick={onNotificationClick}>
              <img src="./../bell.png" alt="通知" className="notification-icon" />
              {unreadCount > 0 && <span className="badge">{unreadCount}</span>}
            </button>
            {showPopup && (
              <div className="notification-popup" ref={popupRef}>
                <div className="tabs">
                  <button onClick={() => setActiveTab("personal")} className={activeTab === "personal" ? "active" : ""}>{t.personal}</button>
                  <button onClick={() => setActiveTab("global")} className={activeTab === "global" ? "active" : ""}>{t.global}</button>
                </div>
                <div className="notifications-list">
                  {activeTab === "personal" && (
                    notifications.length > 0 ? notifications.map((notification) => (
                      <div key={notification.id} className={`notification-item ${notification.is_read ? "read" : "unread"}`} onClick={() => onNotificationMove(notification)}>
                        {notification.message}
                        <span className="time">{new Date(notification.time).toLocaleString()}</span>
                      </div>
                    )) : <p>{t.noNotifications}</p>
                  )}
                  {activeTab === "global" && (
                    globalNotifications.length > 0 ? globalNotifications.map((notification) => (
                      <div key={notification.id} className={`notification-item ${Array.isArray(notification.read_users) && notification.read_users.includes(userId) ? "read" : "unread"}`} onClick={() => onGlobalNotificationMove(notification)}>
                        {notification.message}
                        <span className="time">{new Date(notification.time).toLocaleString()}</span>
                      </div>
                    )) : <p>{t.noNotifications}</p>
                  )}
                </div>
              </div>
            )}
          </div>
          <div className="userIcon">{user ? `${user.nickname}` : t.guest}</div>
        </div>
      </header>

      <div className="register-container">
        <h1>{t.register_question}</h1>
        {errorMessage && <p className="error-message">{errorMessage}</p>}
        <label>{t.category}: {selectedCategoryName || t.notSelected}</label>
        <button className="category-button" onClick={openCategoryModal}>{t.selectcategory}</button>
        <label>{t.qtext}</label>
        <textarea value={content} onChange={(e) => setContent(e.target.value)}></textarea>
        <label>{t.answer}</label>
        <textarea value={answerText} onChange={(e) => setAnswerText(e.target.value)}></textarea>
        <button className="register" onClick={handleRegisterQuestion} disabled={isSubmitting}>
          {isSubmitting ? t.loading : t.register_question}
        </button>
      </div>

      {isCategoryModalOpen && (
        <div className="category-modal">
          <div className="category-modal-content">
            <h2>{t.selectcategory}</h2>
            <div className="category-grid">
              {categoryList.map((category) => (
                <button
                  key={category.id}
                  className={`category-option-button ${category.className}`}
                  onClick={() => handleChangeCategory(category.id, category.name[language] || category.name.ja)}
                  disabled={category.id === selectedCategoryId}
                >
                  {category.name[language] || category.name.ja}
                </button>
              ))}
            </div>
            <button className="modal-close-button" onClick={closeCategoryModal}>{t.close}</button>
          </div>
        </div>
      )}
    </div>
  );
};

export default Question_Admin;
