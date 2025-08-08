// src/components/Admin/Question_Admin.jsx
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

  // --- UI states (second-UI style) ---
  const [isRegisterModalOpen, setIsRegisterModalOpen] = useState(false);
  const [isCategoryModalOpen, setIsCategoryModalOpen] = useState(false);
  const [selectedCategoryId, setSelectedCategoryId] = useState(null);
  const [selectedCategoryName, setSelectedCategoryName] = useState("");
  const [title, setTitle] = useState("official"); // "official" | "unofficial"
  const [isPublic, setIsPublic] = useState(true);

  const [content, setContent] = useState("");
  const [answerText, setAnswerText] = useState("");

  const [language, setLanguage] = useState("ja");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  // notifications (kept using utils/* pattern)
  const [notifications, setNotifications] = useState([]);
  const [globalNotifications, setGlobalNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [showPopup, setShowPopup] = useState(false);
  const [activeTab, setActiveTab] = useState("personal");
  const popupRef = useRef(null);

  const t = translations[language] || translations.ja;

  // --- derive language from user ---
  useEffect(() => {
    if (user?.spokenLanguage) {
      const code = languageLabelToCode[user.spokenLanguage];
      setLanguage(code || "ja");
    }
  }, [user]);

  // --- auth redirect & token refresh hook ---
  useEffect(() => {
    if (user === null) navigate("/new");
    const handleTokenUpdate = () => {
      const latestToken = localStorage.getItem("token");
      if (latestToken) fetchUser(latestToken);
    };
    window.addEventListener("tokenUpdated", handleTokenUpdate);
    return () => window.removeEventListener("tokenUpdated", handleTokenUpdate);
  }, [user, navigate, fetchUser]);

  // --- notifications fetch on user/lang ready ---
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

  // --- click outside to close popup ---
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (popupRef.current && !popupRef.current.contains(event.target)) {
        setShowPopup(false);
      }
    };
    if (showPopup) document.addEventListener("click", handleClickOutside);
    return () => document.removeEventListener("click", handleClickOutside);
  }, [showPopup]);

  // --- handlers ---
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
    updateUserLanguage(newLang); // server + tokenUpdated
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
    setIsPublic(true);
  };

  const handleRegisterQuestion = async () => {
    if (!content.trim()) return setErrorMessage(t.questionerror);
    if (!answerText.trim()) return setErrorMessage(t.answererror);
    if (!selectedCategoryId) return setErrorMessage(t.selectcategory);

    setIsSubmitting(true);
    setErrorMessage("");

    try {
      // NOTE: backendに合わせてエンドポイント名は調整可
      // 例) /admin/register_question を使う
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
          public: isPublic,
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

  // --- render ---
  const userData = localStorage.getItem("user");
  const localUserId = userData ? JSON.parse(userData).id : null;

  return (
    <div className="admin-container-kategori">
      <header className="header">
        <div className="language-wrapper">
          <img src="/globe.png" alt="言語" className="globe-icon" />
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
              <img src="/bell.png" alt="通知" className="notification-icon" />
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

      {/* 上部：カテゴリ一覧（ボタンでカテゴリページへ） */}
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

      {/* 右下固定などの登録ボタン（UIお好みで） */}
      <button className="reg" onClick={openRegisterModal}>
        {t.registerquestion}
      </button>

      {/* 質問登録モーダル */}
      {isRegisterModalOpen && (
        <div className="register-modal">
          <div className="register-container">
            <h1>{t.register_question}</h1>
            {errorMessage && <p className="error-message">{errorMessage}</p>}

            <label>
              {t.category}: {selectedCategoryName || t.notSelected || "—"}
            </label>
            <button className="category-button" onClick={openCategoryModal}>
              {t.selectcategory}
            </button>

            <label>{t.qtext}</label>
            <textarea value={content} onChange={(e) => setContent(e.target.value)} />

            <label>{t.answer}</label>
            <textarea value={answerText} onChange={(e) => setAnswerText(e.target.value)} />

            <div className="toggle-wrapper">
              {/* 公式/非公式 */}
              <div className="title-buttons">
                <button
                  className={`title-button ${title === "official" ? "active" : ""}`}
                  onClick={() => setTitle("official")}
                >
                  {t.official}
                </button>
                <button
                  className={`title-button ${title === "unofficial" ? "active" : ""}`}
                  onClick={() => setTitle("unofficial")}
                >
                  {t.unofficial}
                </button>
              </div>

              {/* 公開/非公開 */}
              <div className="toggle-container">
                <span className="toggle-text">{isPublic ? t.public : t.unpublic}</span>
                <div
                  className={`toggle-switch ${isPublic ? "active" : ""}`}
                  onClick={() => setIsPublic((v) => !v)}
                >
                  <div className="toggle-circle" />
                </div>
              </div>
            </div>

            <button className="register" onClick={handleRegisterQuestion} disabled={isSubmitting}>
              {isSubmitting ? (t.loading || "Loading...") : t.register_question}
            </button>
            <button className="close" onClick={closeRegisterModal}>
              {t.close || "Close"}
            </button>
          </div>
        </div>
      )}

      {/* カテゴリ選択モーダル */}
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
