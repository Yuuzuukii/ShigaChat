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
  const [threads, setThreads] = useState([]);
  const [currentThreadId, setCurrentThreadId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [threadsLoading, setThreadsLoading] = useState(true);
  const [messagesLoading, setMessagesLoading] = useState(false);

  // Drawer state
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

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

  // Server-side thread loading on mount
  useEffect(() => {
    const loadThreadsFromServer = async () => {
      if (!token || !userId) return;

      try {
        setThreadsLoading(true);
        const response = await fetch(`${API_BASE_URL}/question/get_user_threads`, {
          headers: { Authorization: `Bearer ${token}` }
        });

        if (response.ok) {
          const data = await response.json();
          setThreads(data.threads || []);

          // Auto-load the most recent thread if available
          if (data.threads && data.threads.length > 0) {
            const mostRecentThread = data.threads[0];
            console.log('Auto-loading most recent thread:', mostRecentThread);
            setCurrentThreadId(mostRecentThread.thread_id);
            // loadThreadMessages will be called by useEffect when currentThreadId changes
          }
        } else {
          console.error('Failed to load threads from server');
          // Fallback to localStorage
          setThreads(loadThreads());
          const localThreadId = localStorage.getItem(LS_CUR_THREAD_KEY);
          if (localThreadId) {
            setCurrentThreadId(localThreadId);
            setMessages(loadMsgs(localThreadId));
          }
        }
      } catch (error) {
        console.error('Error loading threads:', error);
        // Fallback to localStorage
        setThreads(loadThreads());
        const localThreadId = localStorage.getItem(LS_CUR_THREAD_KEY);
        if (localThreadId) {
          setCurrentThreadId(localThreadId);
          setMessages(loadMsgs(localThreadId));
        }
      } finally {
        setThreadsLoading(false);
      }
    };

    loadThreadsFromServer();
  }, [token, userId]);

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

  // Load messages from server when switching thread
  const loadThreadMessages = async (threadId) => {
    if (!token || !threadId) {
      setMessages([]);
      return;
    }

    // Clear messages first to show loading state
    setMessages([]);
    setMessagesLoading(true);

    try {
      const response = await fetch(`${API_BASE_URL}/question/get_thread_messages/${threadId}`, {
        headers: { Authorization: `Bearer ${token}` }
      });

      if (response.ok) {
        const data = await response.json();
        console.log('Loaded messages for thread:', threadId, data.messages);

        // Convert server format to client format
        const clientMessages = [];
        if (data.messages && data.messages.length > 0) {
          data.messages.forEach((msg) => {
            clientMessages.push({
              id: crypto.randomUUID(),
              role: "user",
              content: msg.question,
              time: msg.created_at
            });
            clientMessages.push({
              id: crypto.randomUUID(),
              role: "assistant",
              content: msg.answer,
              time: msg.created_at,
              rag_qa: msg.rag_qa || []
            });
          });
        }

        setMessages(clientMessages);
        // Still backup to localStorage for offline access
        saveMsgs(threadId, clientMessages);
      } else {
        console.warn('Failed to load from server, using localStorage');
        // Fallback to localStorage
        const localMessages = loadMsgs(threadId);
        setMessages(localMessages);
      }
    } catch (error) {
      console.error('Error loading thread messages:', error);
      // Fallback to localStorage
      const localMessages = loadMsgs(threadId);
      setMessages(localMessages);
    } finally {
      setMessagesLoading(false);
    }
  };

  // Load messages when switching thread
  useEffect(() => {
    if (currentThreadId) {
      console.log('Switching to thread:', currentThreadId);
      loadThreadMessages(currentThreadId);
      localStorage.setItem(LS_CUR_THREAD_KEY, currentThreadId);
    } else {
      // Clear messages when no thread is selected
      setMessages([]);
      localStorage.removeItem(LS_CUR_THREAD_KEY);
    }
  }, [currentThreadId, token]);

  // Still persist messages for backup
  useEffect(() => {
    if (currentThreadId) saveMsgs(currentThreadId, messages);
  }, [messages, currentThreadId]);

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

  const selectThread = (id) => {
    const threadId = String(id);
    console.log('Selecting thread:', threadId);
    setCurrentThreadId(threadId);
  };

  const renameThread = (id, title) => {
    const updated = threads.map(th => th.id === id ? { ...th, title } : th);
    setThreads(updated);
    saveThreads(updated);
  };

  const removeThread = async (id) => {
    const threadId = String(id);

    if (!window.confirm(t?.confirmDeleteThread || "スレッドを削除しますか？")) {
      return;
    }

    if (!token) {
      setErrorMessage(t?.errorLogin || "ログインが必要です");
      return;
    }

    try {
      const response = await fetch(`${API_BASE_URL}/question/delete_thread/${threadId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` }
      });

      if (response.ok) {
        // サーバーから正常に削除された場合、ローカル状態を更新
        const idx = threads.findIndex(t => String(t.thread_id || t.id) === threadId);
        const updated = threads.filter(t => String(t.thread_id || t.id) !== threadId);
        setThreads(updated);
        saveThreads(updated);
        localStorage.removeItem(LS_MSGS_PREFIX + threadId);

        // 削除されたスレッドが現在選択中の場合、別のスレッドに切り替え
        if (threadId === String(currentThreadId)) {
          if (updated.length > 0) {
            // 残っているスレッドの中から最新のものを選択
            const nextThread = updated[Math.max(0, Math.min(idx, updated.length - 1))];
            setCurrentThreadId(String(nextThread.thread_id || nextThread.id));
          } else {
            // スレッドがなくなった場合
            setCurrentThreadId(null);
            setMessages([]);
            localStorage.removeItem(LS_CUR_THREAD_KEY);
          }
        }

        console.log('Thread deleted successfully:', threadId);
      } else {
        let errorMessage = "スレッドの削除に失敗しました";
        try {
          const errorData = await response.json();
          if (errorData.detail) {
            errorMessage = errorData.detail;
          } else if (errorData.message) {
            errorMessage = errorData.message;
          } else if (typeof errorData === 'string') {
            errorMessage = errorData;
          } else if (errorData && typeof errorData === 'object') {
            // オブジェクトの場合は詳細情報を表示
            errorMessage = JSON.stringify(errorData, null, 2);
          }
        } catch (parseError) {
          // JSON解析に失敗した場合は、ステータステキストを使用
          errorMessage = response.statusText || `HTTP ${response.status} Error`;
        }
        throw new Error(errorMessage);
      }
    } catch (error) {
      console.error('Error deleting thread:', error);
      setErrorMessage(error.message);
      // エラー時はローカルのみ削除（フォールバック）
      const idx = threads.findIndex(t => String(t.thread_id || t.id) === threadId);
      const updated = threads.filter(t => String(t.thread_id || t.id) !== threadId);
      setThreads(updated);
      saveThreads(updated);
      localStorage.removeItem(LS_MSGS_PREFIX + threadId);

      if (threadId === String(currentThreadId)) {
        if (updated.length > 0) {
          const nextThread = updated[Math.max(0, Math.min(idx, updated.length - 1))];
          setCurrentThreadId(String(nextThread.thread_id || nextThread.id));
        } else {
          setCurrentThreadId(null);
          setMessages([]);
          localStorage.removeItem(LS_CUR_THREAD_KEY);
        }
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
        let errorMessage = t.failtogetanswer || "Failed to get answer";
        try {
          const err = await res.json();
          console.log('Error response:', err); // デバッグ用ログ
          console.log('Error response type:', typeof err); // デバッグ用ログ
          console.log('Error response keys:', Object.keys(err || {})); // デバッグ用ログ
          
          if (err && err.detail) {
            errorMessage = err.detail;
          } else if (err && err.message) {
            errorMessage = err.message;
          } else if (typeof err === 'string') {
            errorMessage = err;
          } else if (err && typeof err === 'object') {
            // オブジェクトの場合は詳細情報を表示
            errorMessage = JSON.stringify(err, null, 2);
          }
        } catch (parseError) {
          console.error('Error parsing response:', parseError); // デバッグ用ログ
          // JSON解析に失敗した場合は、ステータステキストを使用
          errorMessage = res.statusText || `HTTP ${res.status} Error`;
        }
        console.log('Final error message:', errorMessage); // デバッグ用ログ
        throw new Error(errorMessage);
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
    <div className="home-container">
      {/* Drawer Overlay */}
      {isDrawerOpen && <div className="drawer-overlay" onClick={() => setIsDrawerOpen(false)}></div>}

      {/* Sidebar: Threads Drawer */}
      <aside className={`chat-sidebar drawer ${isDrawerOpen ? "open" : ""}`}>
        <div className="sidebar-header">
          <h3 className="sidebar-title">{t?.threads || "スレッド"}</h3>
          <div className="header-buttons">
            <button className="button" style={{ padding: "6px 10px" }} onClick={createThread}>{t?.newChat || "新規"}</button>
            <button className="close-drawer-btn" onClick={() => setIsDrawerOpen(false)}>×</button>
          </div>
        </div>
        {threadsLoading && (
          <p className="no-threads-message">スレッドを読み込み中...</p>
        )}
        {!threadsLoading && threads.length === 0 && (
          <p className="no-threads-message">{t?.noThreads || "まだスレッドがありません"}</p>
        )}
        <ul className="threads-list">
          {threads.map(th => (
            <li key={th.thread_id || th.id} className={`thread-item ${String(th.thread_id || th.id) === String(currentThreadId) ? "active" : "inactive"}`}>
              <div onClick={() => {
                selectThread(th.thread_id || th.id);
                setIsDrawerOpen(false);
              }} className="thread-content">
                <div className="thread-title">{th.title}</div>
                <div className="thread-time">{new Date(th.last_updated || th.lastUpdated).toLocaleString()}</div>
              </div>
              <button className="button thread-button thread-edit-btn" onClick={(e) => {
                e.stopPropagation();
                const title = prompt(t?.renameThread || "スレッド名を変更", th.title);
                if (title !== null && title.trim()) renameThread(th.thread_id || th.id, title.trim());
              }}>
                <img src="./pencil.png" alt="編集" className="button-icon" />
              </button>
              <button className="button thread-button thread-delete-btn" onClick={(e) => {
                e.stopPropagation();
                removeThread(th.thread_id || th.id);
              }}>
                <img src="./trash.png" alt="削除" className="button-icon" />
              </button>
            </li>
          ))}
        </ul>
      </aside>


      {/* Main Content Area: Header + Chat */}
      <div className="main-content">
        <div className="chat-frame">
          <header className="header">
            <div className="header-left">
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

          {/* Chat area */}
          <main className="chat-main">
            <div className="chat-controls">
              <button className="hamburger-btn chat-hamburger" onClick={() => setIsDrawerOpen(true)}>
                <img src="./threads.png" alt="スレッド一覧" className="threads-icon" />
              </button>
              <button className="new-chat-btn" onClick={createThread}>
                <svg className="new-chat-icon" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z" />
                </svg>
                {t?.newChat || "新規チャット"}
              </button>
            </div>
            <div className="chat-messages">
              {messagesLoading && currentThreadId && (
                <div className="empty-chat-message">
                  <p className="empty-chat-title">メッセージを読み込み中...</p>
                </div>
              )}
              {!messagesLoading && (!currentThreadId || messages.length === 0) && (
                <div className="empty-chat-message">
                  <p className="empty-chat-title">{t?.askQuestion || "質問を入力してください"}</p>
                </div>
              )}

              {!messagesLoading && messages.length > 0 && messages.map((m) => (
                <div key={m.id} className={`message-container ${m.role}`}>
                  <div className={`message-bubble ${m.role}`}>
                    <div className="message-role">{m.role === "user" ? (t?.you || "あなた") : (t?.assistant || "アシスタント")}</div>
                    <div className="message-content">{m.typing ? (t?.generatingAnswer || "回答を生成中…") : m.content}</div>

                    {/* Related (rag_qa) */}
                    {!m.typing && m.rag_qa && m.rag_qa.length > 0 && (
                      <details className="rag-details">
                        <summary className="rag-summary">{t?.similarQuestions || "関連質問"}</summary>
                        <ul className="rag-list">
                          {m.rag_qa.map((q, idx) => (
                            <li key={idx} className="rag-item">
                              <div className="rag-question">{q.question}</div>
                              <div className="rag-answer">{q.answer}</div>
                              {q.retrieved_at && (
                                <div className="rag-time">{new Date(q.retrieved_at).toLocaleString()}</div>
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
            <div className="composer-area">
              {errorMessage && (
                <div className="error-message">{errorMessage}</div>
              )}
              <div className="composer-input">
                <textarea
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder={t.placeholder}
                  className="textArea composer-textarea"
                />
                <button className="button" onClick={sendMessage} disabled={loading || !input.trim()}>
                  {loading ? (t.generatingAnswer || "生成中…") : (t.askButton || "送信")}
                </button>
              </div>
              <div className="composer-help">⌘/Ctrl + Enter で送信</div>
            </div>
          </main>
        </div>
      </div>
    </div>
  );
}
