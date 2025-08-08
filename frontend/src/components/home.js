import React, { useState, useContext, useEffect, useRef, useMemo } from "react";
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

// --- Local persistence keys (per-browser) ---
const LS_THREADS_KEY = "chat_threads";             // array of {id, title, lastUpdated}
const LS_CUR_THREAD_KEY = "chat_current_thread";   // string
const LS_MSGS_PREFIX = "chat_msgs_";               // per-thread messages

function loadThreads() {
  try { return JSON.parse(localStorage.getItem(LS_THREADS_KEY)) || []; } catch { return []; }
}
function saveThreads(threads) {
  localStorage.setItem(LS_THREADS_KEY, JSON.stringify(threads));
}
function loadMsgs(threadId) {
  try { return JSON.parse(localStorage.getItem(LS_MSGS_PREFIX + threadId)) || []; } catch { return []; }
}
function saveMsgs(threadId, msgs) {
  localStorage.setItem(LS_MSGS_PREFIX + threadId, JSON.stringify(msgs));
}

export default function Home() {
  const { user, setUser, token, fetchUser } = useContext(UserContext);
  const [language, setLanguage] = useState("ja");
  const t = translations[language];
  const navigate = useNavigate();

  // Notifications (existing)
  const userId = user?.id;
  const [notifications, setNotifications] = useState([]);
  const [globalNotifications, setGlobalNotifications] = useState([]);
  const [showPopup, setShowPopup] = useState(false);
  const [unreadCount, setUnreadCount] = useState(null);
  const [activeTab, setActiveTab] = useState("personal");
  const [isNotifLoading, setIsNotifLoading] = useState(true);
  const popupRef = useRef(null);

  // Threaded chat
  const [threads, setThreads] = useState(loadThreads());
  const [currentThreadId, setCurrentThreadId] = useState(localStorage.getItem(LS_CUR_THREAD_KEY) || null);
  const [messages, setMessages] = useState(() => currentThreadId ? loadMsgs(currentThreadId) : []);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  // Derived
  const currentThread = useMemo(
    () => threads.find(t => String(t.id) === String(currentThreadId)) || null,
    [threads, currentThreadId]
  );

  // Language bootstrap from user profile
  useEffect(() => {
    if (user?.spokenLanguage) {
      const code = languageLabelToCode[user.spokenLanguage];
      if (code) setLanguage(code); else setLanguage("ja");
    }
  }, [user]);

  // Notifications loading
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
  }, [userId, token, language]);

  // Auth guard + token refresh listener
  useEffect(() => {
    if (user === null) navigate("/new");
    const handleTokenUpdate = () => {
      const latestToken = localStorage.getItem("token");
      if (latestToken) fetchUser(latestToken);
    };
    window.addEventListener("tokenUpdated", handleTokenUpdate);
    return () => window.removeEventListener("tokenUpdated", handleTokenUpdate);
  }, [user, navigate, fetchUser]);

  // Notification popup outside-click
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (popupRef.current && !popupRef.current.contains(event.target)) setShowPopup(false);
    };
    if (showPopup) document.addEventListener("click", handleClickOutside);
    return () => document.removeEventListener("click", handleClickOutside);
  }, [showPopup]);

  // Persist messages for active thread
  useEffect(() => {
    if (currentThreadId) saveMsgs(currentThreadId, messages);
  }, [messages, currentThreadId]);

  // Load messages when switching thread
  useEffect(() => {
    if (!currentThreadId) return;
    const m = loadMsgs(currentThreadId);
    setMessages(m);
    localStorage.setItem(LS_CUR_THREAD_KEY, currentThreadId);
  }, [currentThreadId]);

  // Notification handlers
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
  };

  // --- Thread ops ---
  const createThread = () => {
    const id = Date.now().toString();
    const title = t?.newChat || "新しいチャット";
    const newThreads = [{ id, title, lastUpdated: new Date().toISOString() }, ...threads];
    setThreads(newThreads);
    saveThreads(newThreads);
    setCurrentThreadId(id);
    setMessages([]);
    localStorage.setItem(LS_CUR_THREAD_KEY, id);
  };

  const selectThread = (id) => setCurrentThreadId(String(id));

  const renameThread = (id, title) => {
    const updated = threads.map(th => th.id === id ? { ...th, title } : th);
    setThreads(updated);
    saveThreads(updated);
  };

  const removeThread = (id) => {
    const idx = threads.findIndex(t => t.id === id);
    const updated = threads.filter(t => t.id !== id);
    setThreads(updated);
    saveThreads(updated);
    localStorage.removeItem(LS_MSGS_PREFIX + id);
    if (String(id) === String(currentThreadId)) {
      const next = updated[Math.max(0, idx-1)];
      if (next) setCurrentThreadId(String(next.id));
      else {
        setCurrentThreadId(null);
        localStorage.removeItem(LS_CUR_THREAD_KEY);
        setMessages([]);
      }
    }
  };

  // --- Send message (/question/get_answer) ---
  const sendMessage = async () => {
    if (!token) {
      setErrorMessage(t.errorLogin);
      navigate("/new");
      return;
    }
    const text = input.trim();
    if (!text) return;

    // ensure a thread exists
    let threadId = currentThreadId;
    if (!threadId) {
      const id = Date.now().toString();
      const newThreads = [{ id, title: text.slice(0, 24) || (t?.newChat || "新しいチャット"), lastUpdated: new Date().toISOString() }, ...threads];
      setThreads(newThreads);
      saveThreads(newThreads);
      setCurrentThreadId(id);
      threadId = id;
      setMessages([]);
      localStorage.setItem(LS_CUR_THREAD_KEY, id);
    }

    // optimistic UI
    const userMsg = { id: crypto.randomUUID(), role: "user", content: text, time: new Date().toISOString() };
    const typingMsg = { id: "typing", role: "assistant", content: "…", typing: true };
    setMessages(prev => [...prev, userMsg, typingMsg]);
    setInput("");
    setLoading(true);
    setErrorMessage("");

    try {
      const res = await fetch(`${API_BASE_URL}/question/get_answer`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ thread_id: threadId, text })
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || t.failtogetanswer || "Failed to get answer");
      }
      const data = await res.json();

      // title bootstrap
      if (!currentThread || !currentThread.title || currentThread.title === (t?.newChat || "新しいチャット")) {
        renameThread(threadId, text.slice(0, 24) || (t?.newChat || "新しいチャット"));
      }

      const asstMsg = {
        id: crypto.randomUUID(),
        role: "assistant",
        content: data.answer,
        time: new Date().toISOString(),
        rag_qa: data.rag_qa || []
      };

      setMessages(prev => {
        const next = prev.filter(m => m.id !== "typing");
        next.push(asstMsg);
        return next;
      });

      // update thread time
      const updated = threads.map(th => th.id === threadId ? { ...th, lastUpdated: new Date().toISOString() } : th);
      setThreads(updated);
      saveThreads(updated);
    } catch (e) {
      setMessages(prev => prev.filter(m => m.id !== "typing"));
      setErrorMessage(e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      sendMessage();
    }
  };

  return (
    <div className="home-container" style={{ display: "flex", flexDirection: "column", height: "100vh" }}>
      {/* Header (existing) */}
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
                      notifications.map((n) => (
                        <div key={n.id} className={`notification-item ${n.is_read ? "read" : "unread"}`} onClick={() => onNotificationMove(n)}>
                          {n.message}
                          <span className="time">{new Date(n.time).toLocaleString()}</span>
                        </div>
                      ))
                    ) : (
                      <p>{t.noNotifications}</p>
                    )
                  )}
                  {activeTab === "global" && (
                    globalNotifications.length > 0 ? (
                      globalNotifications.map((n) => (
                        <div key={n.id} className={`notification-item ${Array.isArray(n.read_users) && n.read_users.includes(userId) ? "read" : "unread"}`} onClick={() => onGlobalNotificationMove(n)}>
                          {n.message}
                          <span className="time">{new Date(n.time).toLocaleString()}</span>
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
          <div className="userIcon">{user ? `${user.nickname} ` : t.guest}</div>
        </div>
      </header>

      {/* Body: sidebar + chat area */}
      <div style={{ display: "flex", flex: 1, minHeight: 0 }}>
        {/* Sidebar: Threads */}
        <aside style={{ width: 280, borderRight: "1px solid #eee", padding: 12, overflowY: "auto" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <h3 style={{ margin: 0 }}>{t?.threads || "スレッド"}</h3>
            <button className="button" style={{ padding: "6px 10px" }} onClick={createThread}>{t?.newChat || "新規"}</button>
          </div>
          {threads.length === 0 && (
            <p style={{ color: "#777" }}>{t?.noThreads || "まだスレッドがありません"}</p>
          )}
          <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
            {threads.map(th => (
              <li key={th.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: 8, borderRadius: 8, background: String(th.id) === String(currentThreadId) ? "#f6f6f6" : "transparent", cursor: "pointer" }}>
                <div onClick={() => selectThread(th.id)} style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600, fontSize: 14, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{th.title}</div>
                  <div style={{ fontSize: 12, color: "#666" }}>{new Date(th.lastUpdated).toLocaleString()}</div>
                </div>
                <button className="button" style={{ padding: "4px 8px" }} onClick={() => {
                  const title = prompt(t?.renameThread || "スレッド名を変更", th.title);
                  if (title !== null && title.trim()) renameThread(th.id, title.trim());
                }}>✏️</button>
                <button className="button" style={{ padding: "4px 8px" }} onClick={() => removeThread(th.id)}>🗑️</button>
              </li>
            ))}
          </ul>
        </aside>

        {/* Chat area */}
        <main style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
          <div style={{ flex: 1, overflowY: "auto", padding: 16 }}>
            {(!currentThreadId || messages.length === 0) && (
              <div style={{ textAlign: "center", color: "#666", marginTop: 40 }}>
                <p style={{ fontSize: 18 }}>{t?.askQuestion || "質問を入力してください"}</p>
              </div>
            )}

            {messages.map((m) => (
              <div key={m.id} style={{ display: "flex", justifyContent: m.role === "user" ? "flex-end" : "flex-start", marginBottom: 12 }}>
                <div style={{ maxWidth: 720, width: "fit-content", background: m.role === "user" ? "#dbeafe" : "#f3f4f6", padding: 12, borderRadius: 12, boxShadow: "0 1px 2px rgba(0,0,0,.05)" }}>
                  <div style={{ fontSize: 13, color: "#6b7280", marginBottom: 6 }}>{m.role === "user" ? (t?.you || "あなた") : (t?.assistant || "アシスタント")}</div>
                  <div style={{ whiteSpace: "pre-wrap" }}>{m.typing ? (t?.generatingAnswer || "回答を生成中…") : m.content}</div>

                  {/* Related (rag_qa) */}
                  {!m.typing && m.rag_qa && m.rag_qa.length > 0 && (
                    <details style={{ marginTop: 10 }}>
                      <summary style={{ cursor: "pointer" }}>{t?.similarQuestions || "関連質問"}</summary>
                      <ul style={{ marginTop: 8 }}>
                        {m.rag_qa.map((q, idx) => (
                          <li key={idx} style={{ marginBottom: 6 }}>
                            <div style={{ fontWeight: 600 }}>{q.question}</div>
                            <div style={{ fontSize: 14 }}>{q.answer}</div>
                            {q.retrieved_at && (
                              <div style={{ fontSize: 12, color: "#6b7280" }}>{new Date(q.retrieved_at).toLocaleString()}</div>
                            )}
                          </li>
                        ))}
                      </ul>
                    </details>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Composer */}
          <div style={{ borderTop: "1px solid #eee", padding: 12 }}>
            {errorMessage && (
              <div className="error-message" style={{ marginBottom: 8 }}>{errorMessage}</div>
            )}
            <div style={{ display: "flex", gap: 8 }}>
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={t.placeholder}
                className="textArea"
                style={{ flex: 1, minHeight: 60 }}
              />
              <button className="button" onClick={sendMessage} disabled={loading || !input.trim()}>
                {loading ? (t.generatingAnswer || "生成中…") : (t.askButton || "送信")}
              </button>
            </div>
            <div style={{ marginTop: 6, fontSize: 12, color: "#6b7280" }}>⌘/Ctrl + Enter で送信</div>
          </div>
        </main>
      </div>
    </div>
  );
}

