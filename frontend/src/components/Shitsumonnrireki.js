import React, { useState, useEffect, useContext, useRef } from "react";
import axios from "axios";
import { UserContext } from "../UserContext";
import { useNavigate, useSearchParams } from "react-router-dom";
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
import "./shitsumonnrireki.css";


function Shitsumonnrireki() {
  const [postedHistory, setPostedHistory] = useState([]);
  const [errorMessage, setErrorMessage] = useState(""); // エラーメッセージ
  const [language, setLanguage] = useState("ja"); // 言語選択の状態
  const [expandedQuestionId, setExpandedQuestionId] = useState(null); // 展開中の質問ID
  const [selectedQuestionId, setSelectedQuestionId] = useState(null);
  const [selectedCategoryId, setSelectedCategoryId] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const navigate = useNavigate(); // 画面遷移用
  const { user, setUser, token, setToken, fetchUser } = useContext(UserContext); // UserContextからユーザー情報を取得
  const [notifications, setNotifications] = useState([]);
  const [showPopup, setShowPopup] = useState(false); // ポップアップの表示制御
  const [unreadCount, setUnreadCount] = useState(0);
  const [globalNotifications, setGlobalNotifications] = useState([]); // 全体通知を管理
  const [activeTab, setActiveTab] = useState("personal"); // "personal" または "global"
  const [searchParams] = useSearchParams();
  const [isNotifLoading, setIsNotifLoading] = useState(true);
  const questionId = searchParams.get("id");
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
      fetchPostedHistory();
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
  }, [user, navigate, fetchUser]); 

  useEffect(() => {
    if (showPopup) {
      document.addEventListener("click", handleClickOutside);
    } else {
      document.removeEventListener("click", handleClickOutside);
    }
    return () => document.removeEventListener("click", handleClickOutside);
  }, [showPopup]);

  useEffect(() => {
    if (questionId) {
      const scrollToQuestion = () => {
        const targetElement = document.getElementById(`question-${questionId}`);
        if (targetElement) {
          targetElement.scrollIntoView({ behavior: "smooth", block: "center" });
        } else {
          console.warn(`質問ID ${questionId} の要素が見つかりません。`);
        }
      };

      if (postedHistory.length > 0) {
        scrollToQuestion();
      } else {
        const observer = new MutationObserver(() => {
          if (document.getElementById(`question-${questionId}`)) {
            scrollToQuestion();
            observer.disconnect();
          }
        });

        observer.observe(document.body, { childList: true, subtree: true });

        return () => observer.disconnect();
      }
    }
  }, [questionId, postedHistory]);

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
    setLanguage(newLanguage); // 言語設定を更新
    const success = await updateUserLanguage(newLanguage, setUser); // サーバー側に反映
    if (success) {
      fetchPostedHistory(); // トークン更新後に質問履歴を再取得
    }
  };

  const fetchPostedHistory = async () => {
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
        `${API_BASE_URL}/history/get_posted_question?language_id=${languageMapping[language]}`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      // 回答の重複を排除する
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
      // 🔹 言語が変更されても `public` の状態を保持
      setPostedHistory((prevHistory) => {
        const updatedHistory = response.data.map((item) => {
          const existingItem = prevHistory.find(q => q.question_id === item.question_id);
          return {
            ...item,
            public: existingItem ? existingItem.public : item.public, // `public` を保持
          };
        });
        return updatedHistory;
      });
    } catch (error) {
      setErrorMessage(t.errorFetch);
    }
  };

  const deleteQuestion = async (questionId) => {
    if (!window.confirm(t.confirmDelete)) return;

    try {
      const response = await axios.post(
        `${API_BASE_URL}/admin/delete_question`,
        { question_id: questionId },
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );
      // UIの更新: 削除した質問をリストから削除
      setPostedHistory((prevHistory) =>
        prevHistory.filter((item) => item.question_id !== questionId)
      );

    } catch (error) {
      setErrorMessage(t.errorDelete);
    }
  };

  const toggleExpand = (questionId) => {
    setExpandedQuestionId((prevId) => (prevId === questionId ? null : questionId));
  };

  const togglePublicStatus = async (questionId, currentStatus) => {
    try {
      const response = await axios.post(`${API_BASE_URL}/admin/change_public`, {
        question_id: questionId,
      }, {
        headers: { Authorization: `Bearer ${token}` },
      });
      // 🔹 UIの更新
      setPostedHistory((prevHistory) =>
        prevHistory.map((item) =>
          item.question_id === questionId ? { ...item, public: response.data.public } : item
        )
      );
    } catch (error) {
      console.error(t.publicerror, error);
    }
  };

  const openCategoryModal = (questionId, currentCategoryId) => {
    setSelectedQuestionId(questionId);
    setSelectedCategoryId(currentCategoryId);
    setIsModalOpen(true);
  };

  const closeCategoryModal = () => {
    setIsModalOpen(false);
    setSelectedQuestionId(null);
    setSelectedCategoryId(null);
  };

  const handleChangeCategory = async (newCategoryId, categoryName) => {
    if (!selectedQuestionId) return;

    // ユーザーに選択したカテゴリ名を含めた確認ダイアログを表示
    const confirmChange = window.confirm(`${t.moveto}${categoryName}`);
    if (!confirmChange) return; // キャンセルしたら処理終了

    const requestData = {
      question_id: Number(selectedQuestionId),
      category_id: Number(newCategoryId),
    };
    try {
      const response = await fetch(`${API_BASE_URL}/admin/change_category`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${localStorage.getItem("token")}`,
        },
        body: JSON.stringify(requestData),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error("カテゴリ変更に失敗しました");
      }

      window.alert("カテゴリが変更されました");
      fetchPostedHistory(); // 更新処理
      closeCategoryModal(); // モーダルを閉じる
    } catch (error) {
      window.alert("カテゴリの変更に失敗しました");
    }
  };

  const userData = localStorage.getItem("user");
  const userId = userData ? JSON.parse(userData).id : null;

  return (
    <div className="question-history-container">
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

      <h2 className="keyword-k">{t.questionhistory}</h2>

      <div className="history-list">
        {postedHistory.length > 0 ? (
          postedHistory.map((item) => (
            <div id={`question-${item.question_id}`} key={item.question_id} className="history-item">
              <div
                className="history-question"
                onClick={() => toggleExpand(item.question_id)}
              >
                <div className="question-header">
                  <div className="history-question-text">{item.質問}</div>
                  {item.title === "official" && (
                    <span className="official-badge">{t.official}</span>
                  )}
                </div>
                <div className="history-date" style={{ textAlign: "right" }}>
                  {`${t.questionTime} ${new Date(item.time).toLocaleString()}`}
                </div>
                <button
                  className="change-category-button"
                  onClick={() => openCategoryModal(item.question_id, item.category_id)}
                >
                  {t.changecategory}
                </button>
                <div className="category-current">
                  {t.currentCategory}:{" "}
                  {categoryList.find((cat) => cat.id === item.category_id)?.name[language] ||
                    categoryList.find((cat) => cat.id === item.category_id)?.name.ja ||
                    t.unknownCategory}
                </div>
              </div>
              {/* ✅ 公開/非公開スイッチ (初期状態を `public` の値で設定) */}
              <div className="toggle-wrapper">
                <span className="toggle-text">{item.public ? t.publicToggle : t.privateToggle}</span>
                <div
                  className={`toggle-switch ${item.public ? "active" : ""}`}
                  onClick={() => togglePublicStatus(item.question_id, item.public)}
                >
                  <div className="toggle-circle"></div>
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
              {/* ✅ 削除ボタン */}
              <button className="delete-button" onClick={() => deleteQuestion(item.question_id)}>
                {t.delete}
              </button>
            </div>
          ))
        ) : (
          <p className="no-history">{t.noHistory}</p>
        )}
        {/* ✅ カテゴリ選択ポップアップ */}
        {isModalOpen && (
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
              <button className="modal-close-button" onClick={closeCategoryModal}>{t.cancel}</button>
            </div>
          </div>
        )}
      </div>

      {errorMessage && <p className="error-message">{errorMessage}</p>}
    </div>
  );
}

export default Shitsumonnrireki;
