
import React, { useState, useContext, useEffect, useRef } from "react"; // 修正: useStateをインポート
import { useNavigate } from "react-router-dom";
import { UserContext } from "../../UserContext"; // ユーザー情報を取得
import { updateUserLanguage } from "../../utils/language";
import {
  API_BASE_URL,
  translations,
  languageCodeToId,
  languageLabelToCode,
  categoryList,
} from "../../config/constants";
import {
  fetchNotifications,
  handleNotificationClick,
  handleNotificationMove,
  handleGlobalNotificationMove
} from "../../utils/notifications";
import "./Question_Admin.css";

const Question_Admin = () => {
  const navigate = useNavigate();
  const { user, setUser, token, setToken, fetchUser } = useContext(UserContext); // UserContextからユーザー情報を取得
  const [isRegisterModalOpen, setIsRegisterModalOpen] = useState(false);
  const [isCategoryModalOpen, setIsCategoryModalOpen] = useState(false);
  const [selectedCategoryId, setSelectedCategoryId] = useState(null);
  const [selectedCategoryName, setSelectedCategoryName] = useState(null);
  const [title, setTitle] = useState("official");
  const [content, setContent] = useState("");
  const [answerText, setAnswerText] = useState("");
  const [language, setLanguage] = useState("ja");
  const [isPublic, setIsPublic] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [notifications, setNotifications] = useState([]);
  const [showPopup, setShowPopup] = useState(false); // ポップアップの表示制御
  const [unreadCount, setUnreadCount] = useState(0);
  const [globalNotifications, setGlobalNotifications] = useState([]); // 全体通知を管理
  const [activeTab, setActiveTab] = useState("personal"); // "personal" または "global"
  const [isNotifLoading, setIsNotifLoading] = useState(true);
  const popupRef = useRef(null);

  const t = translations[language]; // 現在の言語の翻訳を取得

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

  const handleLanguageChange = (event) => {
    const newLanguage = event.target.value;
    setLanguage(newLanguage); // 即時反映
    updateUserLanguage(newLanguage); // サーバー側に反映
  };

  const openCategoryModal = () => {
    setIsCategoryModalOpen(true);
  };

  const closeCategoryModal = () => {
    setIsCategoryModalOpen(false);
  };

  const openRegisterModal = () => {
    setIsRegisterModalOpen(true);
  };

  const closeRegisterModal = () => {
    setIsRegisterModalOpen(false);
  };

  const handleChangeCategory = (id, name) => {
    setSelectedCategoryId(id);
    setSelectedCategoryName(name);
    closeCategoryModal();
  };

  const handleRegisterQuestion = async () => {
    if (!content.trim()) {
      setErrorMessage(`${t.questionerror}`);
      return;
    }

    if (!answerText.trim()) {
      setErrorMessage(`${t.answererror}`);
      return;
    }

    if (!selectedCategoryId) {
      setErrorMessage(`${t.selectcategory}`);
      return;
    }

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
          title: title === "official" ? "official" : "ユーザー質問",
          content,
          public: isPublic,
          answer_text: answerText,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        console.error("サーバーレスポンス:", errorData);
        throw new Error(errorData.detail || "質問の登録に失敗しました。");
      }

      const data = await response.json();
      alert(`${t.register}`);
      clearForm();

    } catch (error) {
      console.error("質問登録エラー:", error);
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
    setTitle("official");
    setIsPublic(true);
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
        {/* ユーザーアイコンと通知をまとめたラッパー */}
        <div className="user-notification-wrapper">
          {/* 🔔 通知ボタン（画像版） */}
          <div className={`notification-container ${showPopup ? "show" : ""}`}>
            {/* 🔔 通知ボタン */}
            <button className="notification-button" onClick={onNotificationClick}>
              <img src="./../bell.png" alt="通知" className="notification-icon" />
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
      <div className="admin-body">
        <h1 className="question-admin">{t.questionmanagement}</h1>
        <div>
          <div className="admin-category-container">
            {categoryList.map((category) => (
              <button
                key={category.id}
                className={`admin-category-button admin-${category.className}`}
                onClick={() => navigate(`/admin/category/${category.id}`)}
              >
                {category.name[language]}
              </button>
            ))}
          </div>
        </div>
      </div>
      <button className="reg" onClick={openRegisterModal}>
        {t.registerquestion}
      </button>
      {isRegisterModalOpen && (
        <div className="register-modal">
          <div className="register-container">
            <h1>{t.register_question}</h1>
            {errorMessage && <p className="error-message">{errorMessage}</p>}

            <label>{t.category}:{selectedCategoryName}</label>
            <button className="category-button" onClick={openCategoryModal}>
              {t.selectcategory}
            </button>

            <label>{t.qtext}</label>
            <textarea value={content} onChange={(e) => setContent(e.target.value)}></textarea>

            <label>{t.answer}:</label>
            <textarea value={answerText} onChange={(e) => setAnswerText(e.target.value)}></textarea>

            <div className="toggle-wrapper">
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
              <div className="toggle-container">
                <span className="toggle-text">{isPublic ? t.public : t.unpublic}</span>
                <div className={`toggle-switch ${isPublic ? "active" : ""}`} onClick={() => setIsPublic(!isPublic)}>
                  <div className="toggle-circle"></div>
                </div>
              </div>
            </div>

            <button className="register" onClick={handleRegisterQuestion} disabled={isSubmitting}>
              {isSubmitting ? t.loading : t.register_question}
            </button>
            <button className="close" onClick={closeRegisterModal}>{t.close}</button>
          </div>
        </div>
      )}
      {/* ✅ カテゴリ選択ポップアップ */}
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
                  disabled={category.id === selectedCategoryId} // ✅ 現在のカテゴリは選択不可
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