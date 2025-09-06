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

// --- Local persistence keys (per-browser, per-user scoped) ---
const LS_THREADS_KEY = "chat_threads";             // array of {id, title, lastUpdated}
const LS_CUR_THREAD_KEY = "chat_current_thread";   // string
const LS_MSGS_PREFIX = "chat_msgs_";               // per-thread messages
const LS_CHAT_WIDTH_KEY = "chat_width";            // chat area width preference

function loadThreads() {
  // Deprecated: kept for backward-compat; use per-user variants below
  try { return JSON.parse(localStorage.getItem(LS_THREADS_KEY)) || []; } catch { return []; }
}
function saveThreads(threads) {
  // Deprecated: kept for backward-compat; use per-user variants below
  localStorage.setItem(LS_THREADS_KEY, JSON.stringify(threads));
}
function loadMsgs(threadId) {
  // Deprecated: kept for backward-compat; use per-user variants below
  try { return JSON.parse(localStorage.getItem(LS_MSGS_PREFIX + threadId)) || []; } catch { return []; }
}
function saveMsgs(threadId, msgs) {
  // Deprecated: kept for backward-compat; use per-user variants below
  localStorage.setItem(LS_MSGS_PREFIX + threadId, JSON.stringify(msgs));
}

export default function Home() {
  const { user, setUser, token, fetchUser } = useContext(UserContext);
  const [language, setLanguage] = useState("ja");
  const t = translations[language];
  const navigate = useNavigate();

  // Notifications (existing)
  const userId = user?.id;
  // Per-user localStorage helpers
  const scopedKey = (base) => `${base}_${userId ?? 'nouser'}`;
  const loadThreadsLS = () => {
    try { return JSON.parse(localStorage.getItem(scopedKey(LS_THREADS_KEY))) || []; } catch { return []; }
  };
  const saveThreadsLS = (threadsArr) => {
    localStorage.setItem(scopedKey(LS_THREADS_KEY), JSON.stringify(threadsArr));
  };
  const loadMsgsLS = (threadId) => {
    try { return JSON.parse(localStorage.getItem(`${LS_MSGS_PREFIX}${userId ?? 'nouser'}_${threadId}`)) || []; } catch { return []; }
  };
  const saveMsgsLS = (threadId, msgsArr) => {
    localStorage.setItem(`${LS_MSGS_PREFIX}${userId ?? 'nouser'}_${threadId}`, JSON.stringify(msgsArr));
  };
  const getCurrentThreadIdLS = () => localStorage.getItem(scopedKey(LS_CUR_THREAD_KEY));
  const setCurrentThreadIdLS = (val) => localStorage.setItem(scopedKey(LS_CUR_THREAD_KEY), val);
  const clearCurrentThreadIdLS = () => localStorage.removeItem(scopedKey(LS_CUR_THREAD_KEY));
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
  // Guard to avoid wiping optimistic messages when creating first thread
  const skipNextThreadLoad = useRef(false);
  // Normalize + merge helpers for thread objects
  const toClientThreads = (arr = []) => (arr || []).map(th => ({
    id: String(th.thread_id ?? th.id),
    title: th.title,
    lastUpdated: th.last_updated ?? th.lastUpdated ?? new Date().toISOString(),
  }));
  // Server is the source of truth for threads now
  const [chatWidth, setChatWidth] = useState(() => localStorage.getItem(LS_CHAT_WIDTH_KEY) || "900px");
  const [chatSize, setChatSize] = useState(() => {
    const saved = localStorage.getItem(LS_CHAT_WIDTH_KEY) || "900px";
    if (saved === "1200px") return "medium";
    if (saved === "1400px" || saved === "100%") return "large";
    return "small";
  });

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

  // Apply chat width on mount and when changed
  useEffect(() => {
    try {
      const sizeToWidth = { small: "900px", medium: "1200px", large: "1400px" };
      const width = sizeToWidth[chatSize] || chatWidth || "900px";
      document.documentElement.style.setProperty("--chat-width", width);
      localStorage.setItem(LS_CHAT_WIDTH_KEY, width);
      setChatWidth(width);
    } catch {}
  }, [chatSize]);

  // Server-side thread loading on mount (no localStorage merge)
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
          const serverThreads = toClientThreads(data.threads || []);
          setThreads(serverThreads);

          // Auto-load the most recent thread if available
          if (serverThreads && serverThreads.length > 0) {
            const mostRecentThread = serverThreads[0];
            console.log('Auto-loading most recent thread:', mostRecentThread);
            setCurrentThreadId(String(mostRecentThread.id));
          }
        } else {
          console.error('Failed to load threads from server');
          setThreads([]);
        }
      } catch (error) {
        console.error('Error loading threads:', error);
        setThreads([]);
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

    // Temporary local-only thread: skip server fetch
    if (String(threadId).startsWith('tmp-')) {
      setMessages(loadMsgsLS(threadId));
      return;
    }

    // Clear messages first to show loading state
    setMessages([]);
    setMessagesLoading(true);

    try {
      const response = await fetch(`${API_BASE_URL}/question/get_thread_messages/${encodeURIComponent(String(threadId))}`, {
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
        saveMsgsLS(threadId, clientMessages);
      } else {
        console.warn('Failed to load from server, using localStorage');
        // Fallback to localStorage
        const localMessages = loadMsgsLS(threadId);
        setMessages(localMessages);
      }
    } catch (error) {
      console.error('Error loading thread messages:', error);
      // Fallback to localStorage
      const localMessages = loadMsgsLS(threadId);
      setMessages(localMessages);
    } finally {
      setMessagesLoading(false);
    }
  };

  // Load messages when switching thread
  useEffect(() => {
    if (currentThreadId) {
      console.log('Switching to thread:', currentThreadId);
      if (skipNextThreadLoad.current) {
        // Skip one automatic load to preserve optimistic UI
        skipNextThreadLoad.current = false;
      } else {
        loadThreadMessages(currentThreadId);
      }
      setCurrentThreadIdLS(currentThreadId);
    } else {
      // Clear messages when no thread is selected
      setMessages([]);
      clearCurrentThreadIdLS();
    }
  }, [currentThreadId, token]);

  // Still persist messages for backup
  useEffect(() => {
    if (currentThreadId) saveMsgsLS(currentThreadId, messages);
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

  const handleSetSize = (size) => () => setChatSize(size);

  // --- Thread ops ---
  const createThread = () => {
    // Create a local-only temporary thread context; do not add to sidebar.
    const id = `tmp-${Date.now().toString()}`;
    setCurrentThreadId(id);
    setMessages([]);
    setCurrentThreadIdLS(id);
  };

  const selectThread = (id) => {
    const threadId = String(id);
    console.log('Selecting thread:', threadId);
    setCurrentThreadId(threadId);
  };

  const renameThread = (id, title) => {
    const updated = threads.map(th => String(th.id) === String(id) ? { ...th, title } : th);
    setThreads(updated);
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
        // サーバーから正常に削除された場合、サーバーから一覧を再取得
        try {
          const resp2 = await fetch(`${API_BASE_URL}/question/get_user_threads`, { headers: { Authorization: `Bearer ${token}` } });
          if (resp2.ok) {
            const data2 = await resp2.json();
            const serverThreads = toClientThreads(data2.threads || []);
            setThreads(serverThreads);
            // 選択中スレッドが削除された場合のハンドリング
            if (String(threadId) === String(currentThreadId)) {
              if (serverThreads.length > 0) setCurrentThreadId(String(serverThreads[0].id));
              else {
                setCurrentThreadId(null);
                setMessages([]);
                clearCurrentThreadIdLS();
              }
            }
          }
        } catch {}
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
      const idx = threads.findIndex(t => String(t.id) === threadId);
      const updated = threads.filter(t => String(t.id) !== threadId);
      setThreads(updated);
      localStorage.removeItem(`${LS_MSGS_PREFIX}${userId ?? 'nouser'}_${threadId}`);

      if (threadId === String(currentThreadId)) {
        if (updated.length > 0) {
          const nextThread = updated[Math.max(0, Math.min(idx, updated.length - 1))];
          setCurrentThreadId(String(nextThread.id));
        } else {
          setCurrentThreadId(null);
          setMessages([]);
          clearCurrentThreadIdLS();
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
      const id = `tmp-${Date.now().toString()}`;
      // Avoid immediate server fetch wiping optimistic messages
      skipNextThreadLoad.current = true;
      setCurrentThreadId(id);
      threadId = id;
      setMessages([]);
      setCurrentThreadIdLS(id);
    }

    // optimistic UI
    const userMsg = { id: crypto.randomUUID(), role: "user", content: text, time: new Date().toISOString() };
    const typingMsg = { id: "typing", role: "assistant", content: "…", typing: true };
    setMessages(prev => [...prev, userMsg, typingMsg]);
    setInput("");
    setLoading(true);
    setErrorMessage("");

    try {
      // when threadId is temporary, omit thread_id so server creates autoincrement thread
      const isTemp = String(threadId).startsWith('tmp-');
      const payload = isTemp ? { text } : { thread_id: Number(threadId), text };
      const res = await fetch(`${API_BASE_URL}/question/get_answer`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(payload)
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

      // If we started from a temporary thread, map it to server-assigned ID
      if (isTemp && data && data.thread_id != null) {
        const newId = String(data.thread_id);
        const oldId = String(threadId);
        if (newId !== oldId) {
          // migrate localStorage messages
          try {
            const oldKey = `${LS_MSGS_PREFIX}${userId ?? 'nouser'}_${oldId}`;
            const newKey = `${LS_MSGS_PREFIX}${userId ?? 'nouser'}_${newId}`;
            const oldVal = localStorage.getItem(oldKey);
            if (oldVal !== null) {
              localStorage.setItem(newKey, oldVal);
              localStorage.removeItem(oldKey);
            }
          } catch {}
          setCurrentThreadId(newId);
          setCurrentThreadIdLS(newId);
          threadId = newId;
        }
      }

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
      // Refresh from server to ensure sidebar sync
      try {
        const resp = await fetch(`${API_BASE_URL}/question/get_user_threads`, { headers: { Authorization: `Bearer ${token}` } });
        if (resp.ok) {
          const data2 = await resp.json();
          const serverThreads = toClientThreads(data2.threads || []);
          setThreads(serverThreads);
        }
      } catch {}
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
            <li key={th.id} className={`thread-item ${String(th.id) === String(currentThreadId) ? "active" : "inactive"}`}>
              <div onClick={() => {
                selectThread(th.id);
                setIsDrawerOpen(false);
              }} className="thread-content">
                <div className="thread-title">{th.title}</div>
                <div className="thread-time">{new Date(th.lastUpdated || th.last_updated).toLocaleString()}</div>
              </div>
              <button className="button thread-button thread-edit-btn" onClick={(e) => {
                e.stopPropagation();
                const title = prompt(t?.renameThread || "スレッド名を変更", th.title);
                if (title !== null && title.trim()) renameThread(th.id, title.trim());
              }}>
                <img src="./pencil.png" alt="編集" className="button-icon" />
              </button>
              <button className="button thread-button thread-delete-btn" onClick={(e) => {
                e.stopPropagation();
                removeThread(th.id);
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
            <div className="chat-widthbar" aria-label="画面サイズ設定">
              <span className="widthLabel">画面サイズ</span>
              <div className="widthToggle" role="group" aria-label="画面サイズ">
                <button className={`widthBtn ${chatSize === 'small' ? 'active' : ''}`} onClick={handleSetSize('small')}>小</button>
                <button className={`widthBtn ${chatSize === 'medium' ? 'active' : ''}`} onClick={handleSetSize('medium')}>中</button>
                <button className={`widthBtn ${chatSize === 'large' ? 'active' : ''}`} onClick={handleSetSize('large')}>大</button>
              </div>
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
                    {!m.typing && m.role === "assistant" && (
                      <details className="rag-details">
                        <summary className="rag-summary">{t?.similarQuestions || "関連質問"}</summary>
                        {m.rag_qa && m.rag_qa.length > 0 ? (
                          <ul className="rag-list">
                            {m.rag_qa.map((q, idx) => (
                              <li key={idx}>
                                <details className="rag-item">
                                  <summary className="rag-q-summary">{q.question}</summary>
                                  <div className="rag-answer">{q.answer}</div>
                                  {q.retrieved_at && (
                                    <div className="rag-time">{new Date(q.retrieved_at).toLocaleString()}</div>
                                  )}
                                </details>
                              </li>
                            ))}
                          </ul>
                        ) : (
                          <div className="rag-empty" style={{ padding: "10px 12px" }}>
                            {t?.noSimilarWarning || "類似質問はありません。回答は正確でない可能性があります。"}
                          </div>
                        )}
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
