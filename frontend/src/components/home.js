import React, { useState, useContext, useEffect, useRef, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { UserContext } from "../UserContext";
import { redirectToLogin } from "../utils/auth";
import { updateUserLanguage } from "../utils/language";
import {
  API_BASE_URL,
  translations,
  languageCodeToId,
  languageLabelToCode,
  languageCodeToLabel,
} from "../config/constants";
import {
  fetchNotifications,
  handleNotificationClick,
  handleNotificationMove,
  handleGlobalNotificationMove
} from "../utils/notifications";
import RichText from "./common/RichText";
import { Button } from "./ui/button";
import { Card, CardContent } from "./ui/card";
import { motion, AnimatePresence } from "framer-motion";
import { 
  MessageCircle, 
  Lightbulb, 
  Clock, 
  ExternalLink, 
  ChevronDown, 
  ChevronRight,
  FileText,
  AlertTriangle,
  Loader2,
  Send,
  Languages,
  FileBarChart,
  Sparkles
} from "lucide-react";

// --- Local persistence keys (per-browser, per-user scoped) ---
const LS_THREADS_KEY = "chat_threads";             // array of {id, title, lastUpdated}
const LS_CUR_THREAD_KEY = "chat_current_thread";   // string
const LS_MSGS_PREFIX = "chat_msgs_";               // per-thread messages

export default function Home() {
  const { user, setUser, token, fetchUser, setToken } = useContext(UserContext);
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
  // RAG similarity threshold (0.0–1.0), persisted in localStorage
  const DEFAULT_SIMILARITY = 0.30;
  const [similarity, setSimilarity] = useState(() => {
    const v = localStorage.getItem('rag_similarity_threshold');
    const n = v != null ? parseFloat(v) : DEFAULT_SIMILARITY;
    return Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : DEFAULT_SIMILARITY;
  });
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [actionMessage, setActionMessage] = useState("");
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

  // Drawer state
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const actionRef = useRef(null);
  const [showLangPicker, setShowLangPicker] = useState(false);
  const messagesEndRef = useRef(null);
  const scrollToBottom = () => {
    try { messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }); } catch {}
  };

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

  // Server-side thread loading on mount (no localStorage merge)
  useEffect(() => {
    const loadThreadsFromServer = async () => {
      if (!token || !userId) return;

      try {
        setThreadsLoading(true);
        const response = await fetch(`${API_BASE_URL}/question/get_user_threads`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (response.status === 401) {
          redirectToLogin(navigate);
          return;
        }
        if (response.ok) {
          const data = await response.json();
          const serverThreads = toClientThreads(data.threads || []);
          setThreads(serverThreads);

          // If URL has ?tid=..., prioritize that thread
          const params = new URLSearchParams(window.location.search);
          const fromParam = params.get('tid');
          if (fromParam) {
            setCurrentThreadId(String(fromParam));
          } else {
            // Auto-load the most recent thread if available
            if (serverThreads && serverThreads.length > 0) {
              const mostRecentThread = serverThreads[0];
              setCurrentThreadId(String(mostRecentThread.id));
            }
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
        navigate,
      }).finally(() => setIsNotifLoading(false));
    }
  }, [userId, token, language]);

  // Auth guard + token refresh listener
  useEffect(() => {
    if (user === null) redirectToLogin(navigate);
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
      if (actionRef.current && !actionRef.current.contains(event.target)) setShowLangPicker(false);
    };
    if (showPopup) document.addEventListener("click", handleClickOutside);
    if (showLangPicker) document.addEventListener("click", handleClickOutside);
    return () => document.removeEventListener("click", handleClickOutside);
  }, [showPopup, showLangPicker]);

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
              rag_qa: msg.rag_qa || [],
              // 互換性: typeが空でも rag_qa があれば rag とみなす
              type: msg.type || ((msg.rag_qa && msg.rag_qa.length > 0) ? "rag" : "")
            });
          });
        }

        setMessages(clientMessages);
        // Still backup to localStorage for offline access
        saveMsgsLS(threadId, clientMessages);
      } else if (response.status === 401) {
        redirectToLogin(navigate);
        return;
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
      navigate,
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
    // 先にトークン更新、その後にUI言語反映
    await updateUserLanguage(newLanguage, setUser, setToken);
    setLanguage(newLanguage);
  };

  const handleSimilarityChange = (e) => {
    const n = parseFloat(e.target.value);
    const clamped = Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : DEFAULT_SIMILARITY;
    setSimilarity(clamped);
    try { localStorage.setItem('rag_similarity_threshold', String(clamped)); } catch {}
  };
  const resetSimilarity = () => {
    setSimilarity(DEFAULT_SIMILARITY);
    try { localStorage.setItem('rag_similarity_threshold', String(DEFAULT_SIMILARITY)); } catch {}
  };

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

      if (response.status === 401) {
        redirectToLogin(navigate);
        return;
      } else if (response.ok) {
        // サーバーから正常に削除された場合、サーバーから一覧を再取得
        try {
          const resp2 = await fetch(`${API_BASE_URL}/question/get_user_threads`, { headers: { Authorization: `Bearer ${token}` } });
          if (resp2.status === 401) {
            redirectToLogin(navigate);
          } else if (resp2.ok) {
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
      redirectToLogin(navigate);
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
    resetTextareaHeight(); // textareaの高さをリセット
    setLoading(true);
    setErrorMessage("");

    try {
      // when threadId is temporary, omit thread_id so server creates autoincrement thread
      const isTemp = String(threadId).startsWith('tmp-');
      const base = { text, similarity_threshold: similarity };
      const payload = isTemp ? base : { thread_id: Number(threadId), ...base };
      const res = await fetch(`${API_BASE_URL}/question/get_answer`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(payload)
      });
      if (res.status === 401) {
        // Remove typing placeholder before redirect
        setMessages(prev => prev.filter(m => m.id !== "typing"));
        redirectToLogin(navigate);
        return;
      }
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
        rag_qa: (data.meta && Array.isArray(data.meta.references)) ? data.meta.references : [],
        type: data.type || ""
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
        if (resp.status === 401) {
          redirectToLogin(navigate);
        } else if (resp.ok) {
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

  // textareaの自動サイズ調整
  const textareaRef = useRef(null);
  const handleInputChange = (e) => {
    setInput(e.target.value);
    
    // 入力が空の場合は最小の高さにリセット
    if (!e.target.value.trim()) {
      e.target.style.height = '40px';
      return;
    }
    
    // リサイズのため一時的に高さを自動にして測定
    e.target.style.height = 'auto';
    // 内容に合わせて高さを調整（最小2.5rem、最大8rem）
    const newHeight = Math.min(Math.max(e.target.scrollHeight, 40), 128);
    e.target.style.height = newHeight + 'px';
  };

  // 送信時にtextareaの高さをリセット
  const resetTextareaHeight = () => {
    if (textareaRef.current) {
      textareaRef.current.style.height = '40px'; // 2.5rem = 40px
    }
  };

  // --- Action menu (translate / summarize / simplify) ---
  const applyAction = async (type, targetLangOverride = null) => {
    if (!token) {
      setErrorMessage(t.errorLogin);
      redirectToLogin(navigate);
      return;
    }
    // Find latest assistant answer and its preceding user question
    const lastAssistantIdx = [...messages].map((m, i) => ({ m, i })).reverse().find(x => x.m.role === 'assistant' && !x.m.typing)?.i;
    if (lastAssistantIdx == null) {
      setErrorMessage(t?.noRecentAnswer || "直近の回答がありません");
      setShowLangPicker(false);
      return;
    }
    let lastUserIdx = -1;
    for (let i = lastAssistantIdx - 1; i >= 0; i--) {
      if (messages[i].role === 'user') { lastUserIdx = i; break; }
    }
    const questionText = lastUserIdx >= 0 ? (messages[lastUserIdx].content || "") : "";
    const answerText = messages[lastAssistantIdx].content || "";

    // Add a user-side action bubble
    const actionLabels = {
      translate: t?.actionTranslate || '翻訳',
      summarize: t?.actionSummarize || '要約',
      simplify: t?.actionSimplify || 'わかりやすく',
    };
    const actionText = `${t?.actionApplyPrefix || ''}${actionLabels[type]}${type==='translate' ? ` (${(languageCodeToLabel[targetLangOverride||language] || (targetLangOverride||language))})` : ''}${t?.actionApplySuffix || ''}`;
    const actionMsg = {
      id: crypto.randomUUID(),
      role: "user",
      type: "action",
      content: actionText,
      time: new Date().toISOString(),
    };
    const typingMsg = { id: "action-typing", role: "assistant", type: "action", content: "…", typing: true };
    setMessages(prev => [...prev, actionMsg, typingMsg]);
    setTimeout(scrollToBottom, 0);

    setActionLoading(true);
    setActionMessage("");
    try {
      // Thread ID if available (numeric only)
      let threadIdNum = null;
      if (currentThreadId && !String(currentThreadId).startsWith('tmp-')) {
        const n = Number(currentThreadId);
        if (Number.isFinite(n)) threadIdNum = n;
      }
      const res = await fetch(`${API_BASE_URL}/action/apply`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          action: type,
          question: questionText,
          answer: answerText,
          target_lang: targetLangOverride || language,
          thread_id: threadIdNum,
          action_label: actionText
        })
      });
      if (res.status === 401) {
        setMessages(prev => prev.filter(m => m.id !== "action-typing"));
        redirectToLogin(navigate);
        return;
      }
      if (!res.ok) {
        let msg = t.failtogetanswer || "Failed";
        try { const err = await res.json(); msg = err?.detail || msg; } catch {}
        throw new Error(msg);
      }
      const data = await res.json();
      const result = (data && typeof data.result === 'string') ? data.result : '';
      const asstMsg = {
        id: crypto.randomUUID(),
        role: "assistant",
        // Note: assistant bubble stays normal styling
        type: undefined,
        content: result,
        time: new Date().toISOString(),
      };
      setMessages(prev => {
        const next = prev.filter(m => m.id !== "action-typing");
        next.push(asstMsg);
        return next;
      });

      // If server assigned/mapped thread_id, update current thread and sidebar
      if (data && data.thread_id != null) {
        const newId = String(data.thread_id);
        const oldId = String(currentThreadId || '');
        if (newId !== oldId) {
          // migrate localStorage messages key if needed
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
        }
        // Refresh thread list timestamps
        try {
          const resp = await fetch(`${API_BASE_URL}/question/get_user_threads`, { headers: { Authorization: `Bearer ${token}` } });
          if (resp.ok) {
            const data2 = await resp.json();
            const serverThreads = toClientThreads(data2.threads || []);
            setThreads(serverThreads);
          }
        } catch {}
      }
    } catch (e) {
      setMessages(prev => prev.filter(m => m.id !== "action-typing"));
      setErrorMessage(e.message || String(e));
    } finally {
      setActionLoading(false);
      setShowLangPicker(false);
    }
  };

  // Cross-browser date formatting (supports 'YYYY-MM-DD HH:mm:ss')
  function formatDateTime(val) {
    if (!val) return null;
    try {
      const s = String(val);
      const isoish = (s.includes('T') || s.endsWith('Z')) ? s : s.replace(' ', 'T');
      const d = new Date(isoish);
      if (isNaN(d.getTime())) return s;
      const out = d.toLocaleString();
      // Some environments may include Japanese middle dot as separator; strip it
      return out.replace(/\u30fb/g, ' ');
    } catch (e) {
      return String(val);
    }
  }

  return (
    <div className="h-full w-full bg-gradient-to-br from-blue-50 via-white to-cyan-50 overflow-hidden">
      {/* Centered chat container with limited width */}
      <div className="h-full flex justify-center ">
        <motion.main 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: "easeOut" }}
          className="h-full w-full flex"
        >
          {/* Chat messages container */}
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.3, duration: 0.4 }}
            className="flex-1 min-h-0 max-h-full border border-blue-100 bg-white/80 shadow-sm backdrop-blur-sm relative"
          >
            {/* フローティング絞り込み強度コントロール */}
            <div className="absolute top-3 left-1/2 transform -translate-x-1/2 z-10">
              <Card className="flex items-center gap-2 px-3 py-1.5 bg-white/90 backdrop-blur-sm border-zinc-200 shadow-sm">
                <span className="text-xs font-medium text-zinc-700 whitespace-nowrap">{t?.similarityLabel || '一致の厳しさ'}</span>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-zinc-500">{t?.similarityLow || '弱い'}</span>
                  <input
                    id="similarityRange"
                    className="h-1.5 w-20 cursor-pointer appearance-none rounded-full bg-gradient-to-r from-blue-100 to-blue-200 accent-blue-600 transition-all hover:scale-105"
                    type="range"
                    min="0"
                    max="1"
                    step="0.05"
                    value={similarity}
                    onChange={handleSimilarityChange}
                  />
                  <span className="text-xs text-zinc-500">{t?.similarityHigh || '強い'}</span>
                </div>
                <span className="rounded-md bg-blue-100 px-1.5 py-0.5 text-xs font-mono text-blue-700">{similarity.toFixed(2)}</span>
              </Card>
            </div>

            <div className="h-full flex flex-col">
              {/* Messages area with full width scrolling */}
              <div className="flex-1 overflow-y-auto p-4">
                <div className="mx-auto w-full max-w-4xl">
              {messagesLoading && currentThreadId && (
                <div className="flex h-full items-center justify-center">
                  <div className="flex flex-col items-center gap-3">
                    <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
                    <p className="text-sm text-zinc-600">メッセージを読み込み中...</p>
                  </div>
                </div>
              )}
              {!messagesLoading && (!currentThreadId || messages.length === 0) && (
                <div className="flex h-full items-center justify-center">
                  <div className="text-center">
                    <div className="mb-4 rounded-full bg-blue-100 p-4 mx-auto w-fit">
                      <MessageCircle className="h-8 w-8 text-blue-600" />
                    </div>
                    <p className="text-lg font-medium text-zinc-800">{t?.askQuestion || "質問を入力してください"}</p>
                    <p className="text-sm text-zinc-500 mt-1">ShigaChatでお手伝いできることがあります</p>
                  </div>
                </div>
              )}

              <AnimatePresence mode="popLayout">
                {!messagesLoading && messages.length > 0 && messages.map((m, index) => (
                  <motion.div 
                    key={m.id} 
                    initial={{ opacity: 0, y: 20, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -20, scale: 0.95 }}
                    transition={{ 
                      duration: 0.3, 
                      delay: index * 0.1,
                      type: "spring",
                      stiffness: 200,
                      damping: 20
                    }}
                    className={`mb-6 ${m.role === 'user' ? 'flex justify-end' : ''}`}
                  >
                    {m.role === 'user' ? (
                      // ユーザーメッセージは吹き出し形式
                      <div 
                        className={`max-w-[80%] rounded-2xl border p-4 shadow-sm ${
                          (m.type === 'action' && m.role === 'user') 
                            ? 'border-orange-200 bg-gradient-to-br from-orange-50 to-orange-100/50 text-orange-900' 
                            : 'border-blue-200 bg-gradient-to-br from-blue-50 to-blue-100/50 text-blue-900'
                        }`}
                      >
                        <div className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
                          {(m.type === 'action' && m.role === 'user')
                            ? (t?.actionLabel || 'アクション')
                            : (t?.you || "あなた")}
                        </div>
                        <div className="text-sm leading-relaxed">
                          {m.content}
                        </div>
                      </div>
                    ) : (
                      // アシスタントメッセージはフラット形式
                      <div className="w-full">
                        <div className="mb-3 flex items-center gap-2">
                          <div className="flex h-7 w-7 items-center justify-center rounded-full bg-gradient-to-br from-blue-600 to-blue-700">
                            <Lightbulb className="h-4 w-4 text-white" />
                          </div>
                          <span className="text-sm font-medium text-zinc-700">{t?.assistant || "アシスタント"}</span>
                        </div>
                        <div className="prose prose-sm max-w-none text-zinc-800 leading-relaxed">
                          {m.typing
                            ? (
                              <div className="flex items-center gap-2">
                                <div className="flex gap-1">
                                  <div className="h-2 w-2 animate-bounce rounded-full bg-blue-600 [animation-delay:-0.3s]"></div>
                                  <div className="h-2 w-2 animate-bounce rounded-full bg-blue-600 [animation-delay:-0.15s]"></div>
                                  <div className="h-2 w-2 animate-bounce rounded-full bg-blue-600"></div>
                                </div>
                                <span className="text-sm text-zinc-600">{t?.generatingAnswer || "回答を生成中…"}</span>
                              </div>
                            )
                            : <RichText content={m.content} />}
                        </div>

                        {/* Enhanced RAG section with simple text design */}
                        {!m.typing && ((m.type === "rag") || (m.rag_qa && m.rag_qa.length > 0)) && (
                          <details className="mt-4" open={false}>
                            <summary className="cursor-pointer py-2 text-sm text-zinc-600 hover:text-zinc-800 transition-colors list-none">
                              <div className="flex items-center gap-2">
                                <FileText className="h-4 w-4 text-zinc-500" />
                                <span>{t?.similarQuestions || "参考となる関連質問"} ({m.rag_qa?.length || 0}件)</span>
                                <ChevronDown className="h-3 w-3 text-zinc-400 transition-transform duration-200" />
                              </div>
                            </summary>
                        
                        {m.rag_qa && m.rag_qa.length > 0 ? (
                          <div className="divide-y divide-zinc-200">
                            {m.rag_qa.map((q, idx) => (
                              <details key={idx} className="group" open={false}>
                                <summary className="cursor-pointer px-4 py-3 hover:bg-zinc-50 transition-colors duration-200 list-none">
                                  <div className="flex items-start gap-3">
                                    <div className="flex-1 min-w-0">
                                      <div className="flex items-start justify-between gap-3">
                                        <div className="flex-1 text-sm font-medium text-zinc-800 line-clamp-2">
                                          <RichText content={q.question} />
                                        </div>
                                        {q.category_id && q.question_id && (
                                          <button
                                            className="flex items-center gap-1 text-xs text-zinc-600 hover:text-zinc-800 hover:bg-zinc-100 px-2 py-1 rounded-md transition-colors flex-shrink-0"
                                            title={t?.openInAdmin || "質問管理で開く"}
                                            onClick={(e) => {
                                              e.preventDefault();
                                              e.stopPropagation();
                                              navigate(`/admin/category/${q.category_id}?id=${q.question_id}`);
                                            }}
                                          >
                                            <ExternalLink className="h-3 w-3" />
                                            管理画面で開く
                                          </button>
                                        )}
                                      </div>
                                      {formatDateTime(q.answer_time || q.time) && (
                                        <div className="flex items-center gap-1 mt-2">
                                          <Clock className="h-3 w-3 text-zinc-500" />
                                          <span className="text-xs text-zinc-500">
                                            {formatDateTime(q.answer_time || q.time)}
                                          </span>
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                </summary>
                                <div className="px-4 pb-4">
                                  <div className="rounded-md bg-white border border-zinc-200 p-4">
                                    <div className="text-sm text-zinc-700 leading-relaxed">
                                      <RichText content={q.answer} />
                                    </div>
                                    {q.retrieved_at && (
                                      <div className="mt-3 pt-3 border-t border-zinc-200">
                                        <span className="text-xs text-zinc-500 bg-zinc-100 px-2 py-1 rounded-md">
                                          取得日時: {new Date(q.retrieved_at).toLocaleString()}
                                        </span>
                                      </div>
                                    )}
                                  </div>
                                </div>
                              </details>
                            ))}
                          </div>
                        ) : (
                          <div className="px-4 py-6 text-center">
                            <div className="flex flex-col items-center gap-3">
                              <div className="flex h-10 w-10 items-center justify-center rounded-md bg-zinc-200">
                                <AlertTriangle className="h-5 w-5 text-zinc-500" />
                              </div>
                              <div>
                                <p className="text-sm font-medium text-zinc-700">{t?.noSimilarWarning || "類似質問が見つかりませんでした"}</p>
                                <p className="text-xs text-zinc-500 mt-1">回答は一般的な知識に基づいています</p>
                              </div>
                            </div>
                          </div>
                        )}
                          </details>
                        )}
                      </div>
                    )}
                  </motion.div>
                ))}
              </AnimatePresence>
                </div>
            </div>
            
            {/* Fixed input area at bottom - no border */}
            <div className="bg-white/95 backdrop-blur-sm p-4">
              <motion.div 
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.5, duration: 0.4 }}
                className="mx-auto w-full max-w-4xl"
              >
                <Card className="shadow-sm">
                  <CardContent className="p-4">
                    {/* アクション機能 */}
                    <motion.div 
                      initial={{ opacity: 0, scale: 0.95 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ delay: 0.3, duration: 0.4 }}
                      className="mb-3"
                      aria-label="アクション機能"
                    >
                      <Card className="p-2 bg-gradient-to-r from-green-50 to-emerald-50 border-green-200">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-medium text-zinc-700">{t?.actionLabel || 'アクション'}</span>
                          <div className="flex items-center gap-2">
                        <div className="relative" ref={actionRef}>
                          <Button 
                            variant="outline" 
                            size="sm"
                            onClick={(e) => {e.stopPropagation(); setShowLangPicker(v => !v);}} 
                            disabled={actionLoading}
                            className="px-3 py-1 rounded-lg transition-all hover:shadow-sm text-xs h-7 flex items-center gap-1"
                          >
                            <Languages className="h-3 w-3" />
                            {t?.actionTranslate || '翻訳'}
                          </Button>
                          {showLangPicker && (
                            <div className="absolute left-0 bottom-full z-50 mb-1 min-w-32 rounded-lg border border-zinc-200 bg-white p-1 shadow-lg">
                              {Object.keys(languageCodeToLabel).map(code => (
                                <button 
                                  key={code} 
                                  className="block w-full rounded p-2 text-left text-xs hover:bg-zinc-50 transition-colors" 
                                  onClick={() => {
                                    applyAction('translate', code);
                                    setShowLangPicker(false);
                                  }} 
                                  disabled={actionLoading}
                                >
                                  {languageCodeToLabel[code]}
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                        <Button 
                          variant="outline" 
                          size="sm"
                          onClick={() => applyAction('summarize')} 
                          disabled={actionLoading}
                          className="px-3 py-1 rounded-lg transition-all hover:shadow-sm text-xs h-7 flex items-center gap-1"
                        >
                          <FileBarChart className="h-3 w-3" />
                          {t?.actionSummarize || '要約'}
                        </Button>
                        <Button 
                          variant="outline" 
                          size="sm"
                          onClick={() => applyAction('simplify')} 
                          disabled={actionLoading}
                          className="px-3 py-1 rounded-lg transition-all hover:shadow-sm text-xs h-7 flex items-center gap-1"
                        >
                          <Sparkles className="h-3 w-3" />
                          {t?.actionSimplify || 'わかりやすく'}
                        </Button>
                          </div>
                        </div>
                      </Card>
                    </motion.div>
                  {errorMessage && (
                    <div className="mb-3 rounded-lg border border-red-200 bg-red-50 p-2 text-sm text-red-700">
                      {errorMessage}
                    </div>
                  )}
                  {actionMessage && (
                    <div className="mb-3 rounded-lg border border-blue-200 bg-blue-50 p-2 text-sm text-blue-700">
                      {actionMessage}
                    </div>
                  )}
                  <div className="flex gap-3">
                    <textarea
                      ref={textareaRef}
                      value={input}
                      onChange={handleInputChange}
                      onKeyDown={handleKeyDown}
                      placeholder={t.placeholder}
                      className="flex-1 resize-none rounded-xl border border-zinc-300 bg-white px-4 py-2 text-sm shadow-sm transition-all focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-400/20 min-h-[2.5rem] h-10 leading-5"
                      rows="1"
                    />
                    <Button 
                      onClick={sendMessage} 
                      disabled={loading || !input.trim()}
                      className="w-20 rounded-lg bg-gradient-to-r from-blue-600 to-blue-700 px-4 py-2 font-medium text-white shadow-sm transition-all hover:from-blue-700 hover:to-blue-800 hover:shadow-md disabled:opacity-50 text-sm flex items-center justify-center gap-1"
                    >
                      {loading ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <>
                          <Send className="h-3 w-3" />
                          <span className="hidden sm:inline">{t.askButton || "送信"}</span>
                        </>
                      )}
                    </Button>
                  </div>
                  <div className="mt-2 text-xs text-zinc-500">⌘/Ctrl + Enter で送信</div>
                  </CardContent>
                </Card>
              </motion.div>
            </div>
          </div>
        </motion.div>
        
        <div ref={messagesEndRef} />
      </motion.main>
    </div>
    </div>
  );
}
