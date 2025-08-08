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
  const { user, setUser, token, setToken, fetchUser } = useContext(UserContext);
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

  // ユーザーIDを取得
  const userId = user?.id;

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
    if (userId && token) {
      fetchNotifications({
        language,
        token,
        userId,
        setNotifications,
        setGlobalNotifications,
        setUnreadCount,
      }).finally(() => setIsNotifLoading(false));
    }
  }, [user, token, language]);

  useEffect(() => {
    if (user === null) {
      navigate("/new");
    }
    const handleTokenUpdate = () => {
      const latestToken = localStorage.getItem("token");
      if (latestToken) {
        fetchUser(latestToken);
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
    setLanguage(newLanguage);
    await updateUserLanguage(newLanguage, setUser);
  
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
        setAnswer(data.text || t.failtogetanswer);
      } catch (error) {
        setAnswer(t.error + error.message);
        console.error("回答翻訳エラー:", error);
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
    setErrorMessage("");
    
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
      
      if (!postRes.ok) {
        const errorData = await postRes.json();
        throw new Error(errorData.detail || t.failedtopost);
      }
      
      const { question_id } = await postRes.json();

      const getRes = await fetch(`${API_BASE_URL}/question/get_answer`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ 
          thread_id: Date.now(), // ユニークなスレッドIDを生成
          text: question 
        }),
      });
      
      if (!getRes.ok) {
        const errorData = await getRes.json();
        throw new Error(errorData.detail || t.failtogetanswer);
      }
      
      const data = await getRes.json();

      setAnswer(data.answer || t.failtogetanswer);
      setAnswerId(data.answer_id || null);
      
      if (data.rag_qa && data.rag_qa.length > 0) {
        const translated = await fetchTranslatedSimilarQuestions(data.rag_qa);
        const withAnswers = await fetchTranslatedSimilarAnswers(translated);
        setSimilarQuestions(withAnswers);
      }
    } catch (error) {
      console.error("質問投稿エラー:", error);
      setAnswer(t.error + error.message);
      setErrorMessage(error.message);
    } finally {
      setLoading(false);
      setQuestion("");
    }
  };

  const fetchTranslatedSimilarQuestions = async (questions) => {
    try {
      return await Promise.all(questions.map(async (q) => {
        const res = await fetch(`${API_BASE_URL}/question/get_translated_question?question_id=${q.question_id || q.question}&language_id=${languageCodeToId[language]}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json();
        return { ...q, content: data.text || q.content || q.question };
      }));
    } catch (error) {
      console.error("翻訳取得エラー:", error.message);
      return questions;
    }
  };

  const fetchTranslatedSimilarAnswers = async (questions) => {
    try {
      return await Promise.all(questions.map(async (q) => {
        if (!q.answer_id) return q;
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
    if (sortBy === "similarity") return (b.score || 0) - (a.score || 0);
    if (sortBy === "date") return new Date(b.retrieved_at || b.time) - new Date(a.retrieved_at || a.time);
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
        <div className="user-notification-wrapper">
          <div className={`notification-container ${showPopup ? "show" : ""}`}>
            <button className="notification-button" onClick={onNotificationClick}>
              <img src="./bell.png" alt="通知" className="notification-icon" />
              {unreadCount > 0 && <span className="badge">{unreadCount}</span>}
            </button>

            {showPopup && (
              <div className="notification-popup" ref={popupRef}>
                <div className="tabs">
                  <button onClick={() => setActiveTab("personal")} className={activeTab === "personal" ? "active" : ""}>
                    {t.personal}
                  </button>
                  <button onClick={() => setActiveTab("global")} className={activeTab === "global" ? "active" : ""}>
                    {t.global}
                  </button>
                </div>

                <div className="notifications-list">
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
                      <p>{t.noNotifications}</p>
                    )
                  )}

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
                      <p>{t.noNotifications}</p>
                    )
                  )}
                </div>
              </div>
            )}
          </div>
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
        <div className="toggle-wrapper">
          <span className="toggle-text">{isPublic ? t.makepublicToggle : t.makeprivateToggle}</span>
          <div className={`toggle-switch ${isPublic ? "active" : ""}`} onClick={() => setIsPublic(!isPublic)}>
            <div className="toggle-circle"></div>
          </div>
        </div>

        <button onClick={handleQuestionSubmit} className="button" disabled={loading}>
          {t.askButton}
        </button>
        
        {errorMessage && (
          <div className="error-message">
            {errorMessage}
          </div>
        )}
        
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
                          <strong>{q.content || q.question}</strong>
                        </div>
                        {q.title === "official" && (
                          <span className="official-badge">{t.official}</span>
                        )}
                      </div>
                      <div className="question-time" style={{ textAlign: "right" }}>
                        {`${t.questionDate} ${new Date(q.retrieved_at || q.time).toLocaleString()}`}
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
