import React, { useState, useContext, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { UserContext } from "../UserContext";
import { updateUserLanguage } from "../utils/language";
import {
  API_BASE_URL,
  translations,
  languageCodeToId,
  languageLabelToCode,
} from "../config/constants";
import {
  fetchNotifications,
  handleNotificationClick,
  handleNotificationMove,
  handleGlobalNotificationMove
} from "../utils/notifications";
import "./Home.css";

function Home() {
  const { user, setUser, token, setToken, fetchUser, } = useContext(UserContext);
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [similarQuestions, setSimilarQuestions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [answerId, setAnswerId] = useState(null);
  const [language, setLanguage] = useState("ja");
  const [visibleAnswer, setVisibleAnswer] = useState(null);
  const [sortBy, setSortBy] = useState("similarity");
  const [errorMessage, setErrorMessage] = useState("");
  const [isPublic, setIsPublic] = useState(true);
  const [notifications, setNotifications] = useState([]);
  const [showPopup, setShowPopup] = useState(false);
  const [unreadCount, setUnreadCount] = useState(null);
  const [globalNotifications, setGlobalNotifications] = useState([]);
  const [activeTab, setActiveTab] = useState("personal");
  const [isNotifLoading, setIsNotifLoading] = useState(true);
  const popupRef = useRef(null);

  const t = translations[language];
  const navigate = useNavigate();

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
    setLanguage(newLanguage); // UI反映
    await updateUserLanguage(newLanguage, setUser); // サーバー反映
  
    const langId = languageCodeToId[newLanguage];
  
    if (answerId) {
      try {
        const response = await fetch(
          `${API_BASE_URL}/translator/get_translated_answer?answer_id=${answerId}&language_id=${langId}`,
          {
            method: "GET",
            headers: {
              Authorization: `Bearer ${token}`,
            },
          }
        );
        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.detail || t.failtogetanswer);
        }
  
        const data = await response.json();
        setAnswer(data.text || t.error + t.failtogetanswer);
      } catch (error) {
        setAnswer(t.error + error.message);
        alert(JSON.stringify(error, null, 2));
      }
    }
  
    if (similarQuestions.length > 0) {
      const translatedQuestions = await fetchTranslatedSimilarQuestions(similarQuestions, newLanguage);
      const translatedQuestionsWithAnswers = await fetchTranslatedSimilarAnswers(translatedQuestions, newLanguage);
      setSimilarQuestions(translatedQuestionsWithAnswers);
    }
  };

  const handleQuestionSubmit = async () => {
    if (!token) {
      setErrorMessage(t.errorLogin);
      navigate("/new");
      return;
    }
    if (!question.trim()) {
      setAnswer(t.enterquestion);
      return;
    }
    setLoading(true);
    setAnswer("");
    setSimilarQuestions([]);
    try {
      const postRes = await fetch(`${API_BASE_URL}/question/post_question`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          category_id: 1,
          content: question,
          language_id: languageCodeToId[language],
          public: isPublic ? 1 : 0,
        }),
      });
      if (!postRes.ok) throw new Error((await postRes.json()).detail || t.failedtopost);
      const { question_id } = await postRes.json();

      const getRes = await fetch(`${API_BASE_URL}/question/get_answer`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ question_id }),
      });
      if (!getRes.ok) throw new Error((await getRes.json()).detail || t.failtogetanswer);
      const data = await getRes.json();

      setAnswer(data.answer || t.failtogetanswer);
      setAnswerId(data.answer_id || null);
      const translated = await fetchTranslatedSimilarQuestions(data.source_documents);
      const withAnswers = await fetchTranslatedSimilarAnswers(translated);
      setSimilarQuestions(withAnswers);
    } catch (error) {
      console.error(error.message);
      setAnswer(t.error + error.message);
    } finally {
      setLoading(false);
      setQuestion("");
    }
  };

  const fetchTranslatedSimilarQuestions = async (questions) => {
    try {
      return await Promise.all(questions.map(async (q) => {
        const res = await fetch(`${API_BASE_URL}/question/get_translated_question?question_id=${q.question_id}&language_id=${languageCodeToId[language]}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json();
        return { ...q, content: data.text || q.content };
      }));
    } catch (error) {
      console.error("翻訳取得エラー:", error.message);
      return questions;
    }
  };

  const fetchTranslatedSimilarAnswers = async (questions) => {
    try {
      return await Promise.all(questions.map(async (q) => {
        const res = await fetch(`${API_BASE_URL}/question/get_translated_answer?answer_id=${q.answer_id}&language_id=${languageCodeToId[language]}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json();
        return { ...q, answer: data.text || q.answer };
      }));
    } catch (error) {
      console.error("回答翻訳取得エラー:", error.message);
      return questions;
    }
  };

  const handleSortChange = (event) => {
    setSortBy(event.target.value);
  };

  const sortedSimilarQuestions = [...similarQuestions].sort((a, b) => {
    if (sortBy === "similarity") return b.similarity - a.similarity;
    if (sortBy === "date") return new Date(b.time) - new Date(a.time);
    return 0;
  });

  const addHistory = async (questionId) => {
    if (!questionId) return;
    try {
      await fetch(`${API_BASE_URL}/history/add_history`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ question_id: questionId }),
      });
    } catch (e) {
      console.error("履歴追加エラー:", e);
    }
  };

  const toggleAnswer = (questionId) => {
    setVisibleAnswer(visibleAnswer === questionId ? null : questionId);
    addHistory(questionId);
  };

  const userData = localStorage.getItem("user");
  const userId = userData ? JSON.parse(userData).id : null;

  return (
    <div className="home-container">
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
      <div className="qa_section">
        <h2 className="kotoba">{t.askQuestion}</h2>
        <label htmlFor="question" className="label">
          {t.questionLabel}
        </label>
        <textarea
          id="question"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          className="textArea"
          placeholder={t.placeholder}
        ></textarea>
        {/* 公開/非公開の切り替えスイッチ（右端に配置） */}
        <div className="toggle-wrapper">
          <span className="toggle-text">{isPublic ? t.makepublicToggle : t.makeprivateToggle}</span>
          <div className={`toggle-switch ${isPublic ? "active" : ""}`} onClick={() => setIsPublic(!isPublic)}>
            <div className="toggle-circle"></div>
          </div>
        </div>

        <button onClick={handleQuestionSubmit} className="button" disabled={loading}>
          {t.askButton}
        </button>
        {loading ? (
          <p>{t.generatingAnswer}</p>
        ) : (
          <div className="answerSection">
            <p className="answerLabel">{t.answer}</p>
            <div className="answerBox">{answer}</div>
            {similarQuestions.length > 0 && (
              <div className="similarQuestions">
                <h3>{t.similarQuestions}</h3>
                <select value={sortBy} onChange={handleSortChange} className="sortSelector">
                  <option value="similarity">{t.sortBySimilarity}</option>
                  <option value="date">{t.sortByDate}</option>
                </select>
                <ul className="question-list">
                  {sortedSimilarQuestions.map((q, index) => (
                    <div className="question-item" key={index} onClick={() => toggleAnswer(q.question_id)} style={{ cursor: "pointer" }}>
                      <div className="question-header">
                        <div className="question-content">
                          <strong>{q.content}</strong>
                        </div>
                        {q.title === "official" && (
                          <span className="official-badge">{t.official}</span>
                        )}
                      </div>
                      <div className="question-time" style={{ textAlign: "right" }}>
                        {`${t.questionDate} ${new Date(q.time).toLocaleString()}`}
                      </div>
                      {visibleAnswer === q.question_id && (
                        <div className="answer-section">
                          <strong>{t.answer}</strong>
                          <p>{q.answer || t.failtogetanswer}</p>
                        </div>
                      )}
                    </div>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default Home;
