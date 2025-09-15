// src/components/Admin/Question_Admin.jsx
import React, { useState, useContext, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { redirectToLogin } from "../../utils/auth";
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

  const [isRegisterModalOpen, setIsRegisterModalOpen] = useState(false);
  const [isCategoryModalOpen, setIsCategoryModalOpen] = useState(false);
  const [selectedCategoryId, setSelectedCategoryId] = useState(null);
  const [selectedCategoryName, setSelectedCategoryName] = useState("");
  const [title, setTitle] = useState("official"); // "official" | "unofficial"

  const [content, setContent] = useState("");
  const [answerText, setAnswerText] = useState("");

  const [language, setLanguage] = useState("ja");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const [notifications, setNotifications] = useState([]);
  const [globalNotifications, setGlobalNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [showPopup, setShowPopup] = useState(false);
  const [activeTab, setActiveTab] = useState("personal");
  const popupRef = useRef(null);

  const t = translations[language] || translations.ja;

  useEffect(() => {
    if (user?.spokenLanguage) {
      const code = languageLabelToCode[user.spokenLanguage];
      setLanguage(code || "ja");
    }
  }, [user]);

  useEffect(() => {
  if (user === null) redirectToLogin(navigate);
    const handleTokenUpdate = () => {
      const latestToken = localStorage.getItem("token");
      if (latestToken) fetchUser(latestToken);
    };
    window.addEventListener("tokenUpdated", handleTokenUpdate);
    return () => window.removeEventListener("tokenUpdated", handleTokenUpdate);
  }, [user, navigate, fetchUser]);

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
    const handleClickOutside = (event) => {
      if (popupRef.current && !popupRef.current.contains(event.target)) {
        setShowPopup(false);
      }
    };
    if (showPopup) document.addEventListener("click", handleClickOutside);
    return () => document.removeEventListener("click", handleClickOutside);
  }, [showPopup]);

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
      fetchNotifications({
        language,
        token,
        userId: user?.id,
        setNotifications,
        setGlobalNotifications,
        setUnreadCount,
      });
    });
  };

  const onGlobalNotificationMove = (notification) => {
    handleGlobalNotificationMove(notification, navigate, token, () => {
      fetchNotifications({
        language,
        token,
        userId: user?.id,
        setNotifications,
        setGlobalNotifications,
        setUnreadCount,
      });
    });
  };

  const handleLanguageChange = (e) => {
    const newLang = e.target.value;
    setLanguage(newLang);
    updateUserLanguage(newLang);
  };

  const handleCategoryClick = (id) => {
    navigate(`/admin/category/${id}`);
  };

  const openCategoryModal = () => setIsCategoryModalOpen(true);
  const closeCategoryModal = () => setIsCategoryModalOpen(false);
  const openRegisterModal = () => setIsRegisterModalOpen(true);
  const closeRegisterModal = () => setIsRegisterModalOpen(false);

  const handleChangeCategory = (id, name) => {
    setSelectedCategoryId(id);
    setSelectedCategoryName(name);
    closeCategoryModal();
  };

  const clearForm = () => {
    setContent("");
    setAnswerText("");
    setSelectedCategoryId(null);
    setSelectedCategoryName("");
    setTitle("official");
  };

  const handleRegisterQuestion = async () => {
    if (!content.trim()) return setErrorMessage(t.questionerror);
    if (!answerText.trim()) return setErrorMessage(t.answererror);
    if (!selectedCategoryId) return setErrorMessage(t.selectcategory);

    setIsSubmitting(true);
    setErrorMessage("");

    try {
      const res = await fetch(`${API_BASE_URL}/admin/register_question`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          category_id: selectedCategoryId,
          title: title === "official" ? "official" : "ユーザー質問",
          content,
          answer_text: answerText,
          public: true, // ← トグル削除に伴い常に公開（不要ならこの行を消す）
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || "QA登録に失敗しました。");
      }

      alert(t.register);
      clearForm();
      setIsRegisterModalOpen(false);
    } catch (e) {
      console.error("QA登録エラー:", e);
      setErrorMessage(e.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const userData = localStorage.getItem("user");
  const localUserId = userData ? JSON.parse(userData).id : null;

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
                  <button
                    onClick={() => setActiveTab("personal")}
                    className={activeTab === "personal" ? "active" : ""}
                  >
                    {t.personal}
                  </button>
                  <button
                    onClick={() => setActiveTab("global")}
                    className={activeTab === "global" ? "active" : ""}
                  >
                    {t.global}
                  </button>
                </div>

                <div className="notifications-list">
                  {activeTab === "personal" ? (
                    notifications.length > 0 ? (
                      notifications.map((n) => (
                        <div
                          key={n.id}
                          className={`notification-item ${n.is_read ? "read" : "unread"}`}
                          onClick={() => onNotificationMove(n)}
                        >
                          {n.message}
                          <span className="time">{new Date(n.time).toLocaleString()}</span>
                        </div>
                      ))
                    ) : (
                      <p>{t.noNotifications}</p>
                    )
                  ) : globalNotifications.length > 0 ? (
                    globalNotifications.map((n) => (
                      <div
                        key={n.id}
                        className={`notification-item ${
                          Array.isArray(n.read_users) &&
                          n.read_users.map(Number).includes(localUserId)
                            ? "read"
                            : "unread"
                        }`}
                        onClick={() => onGlobalNotificationMove(n)}
                      >
                        {n.message}
                        <span className="time">{new Date(n.time).toLocaleString()}</span>
                      </div>
                    ))
                  ) : (
                    <p>{t.noNotifications}</p>
                  )}
                </div>
              </div>
            )}
          </div>

          <div className="userIcon">{user ? `${user.nickname}` : (t.guest || "Guest")}</div>
        </div>
      </header>

      <div className="admin-body">
        <h1 className="question-admin">{t.questionmanagement}</h1>
        <div className="admin-category-container">
          {categoryList.map((category) => (
            <button
              key={category.id}
              className={`admin-category-button admin-${category.className}`}
              onClick={() => handleCategoryClick(category.id)}
            >
              {category.name[language] || category.name.ja}
            </button>
          ))}
        </div>
      </div>

      <button className="reg" onClick={openRegisterModal} disabled={isSubmitting}>
        {t.registerquestion}
      </button>

      {isRegisterModalOpen && (
        <div className="register-modal">
          <div className="register-container">
            <h1>{t.register_question}</h1>
            {errorMessage && <p className="error-message">{errorMessage}</p>}

            <label>
              {t.category}: {selectedCategoryName || t.notSelected || "—"}
            </label>
            <button className="category-button" onClick={openCategoryModal} disabled={isSubmitting}>
              {t.selectcategory}
            </button>

            <label>{t.qtext}</label>
            <textarea value={content} onChange={(e) => setContent(e.target.value)} />

            <label>{t.answer}</label>
            <textarea value={answerText} onChange={(e) => setAnswerText(e.target.value)} />



            <button className="register" onClick={handleRegisterQuestion} disabled={isSubmitting}>
              {isSubmitting ? (t.loading || "Loading...") : t.register_question}
            </button>
            <button className="close" onClick={closeRegisterModal} disabled={isSubmitting}>
              {t.close || "Close"}
            </button>
          </div>
        </div>
      )}

      {isCategoryModalOpen && (
        <div className="category-modal">
          <div className="category-modal-content">
            <h2>{t.selectcategory}</h2>
            <div className="category-grid">
              {categoryList.map((category) => (
                <button
                  key={category.id}
                  className={`category-option-button ${category.className}`}
                  onClick={() =>
                    handleChangeCategory(category.id, category.name[language] || category.name.ja)
                  }
                  disabled={category.id === selectedCategoryId}
                >
                  {category.name[language] || category.name.ja}
                </button>
              ))}
            </div>
            <button className="modal-close-button" onClick={closeCategoryModal}>
              {t.close || "Close"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default Question_Admin;
