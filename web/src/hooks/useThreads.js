/**
 * useThreads - スレッドCRUD操作
 */
import { useState, useCallback, useEffect, useRef } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { fetchUserThreads, fetchThreadMessages, deleteThread as deleteThreadApi } from "../services/api";

const LS_MSGS_PREFIX = "chat_msgs_";

export function useThreads({ token, userId, t, onUnauthorized }) {
  const navigate = useNavigate();
  const location = useLocation();

  const [threads, setThreads] = useState([]);
  const [currentThreadId, setCurrentThreadId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [threadsLoading, setThreadsLoading] = useState(true);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const skipNextThreadLoad = useRef(false);

  const [threadTitleOverrides, setThreadTitleOverrides] = useState(() => {
    try {
      const raw = localStorage.getItem(`thread_title_overrides_${userId ?? "nouser"}`);
      return raw ? JSON.parse(raw) : {};
    } catch { return {}; }
  });

  const saveOverrides = useCallback((obj) => {
    try { localStorage.setItem(`thread_title_overrides_${userId ?? "nouser"}`, JSON.stringify(obj)); } catch {}
  }, [userId]);

  // ─── helpers ───

  const toClientThreads = useCallback((arr = []) =>
    (arr || []).map((th) => ({
      id: String(th.thread_id ?? th.id),
      title: threadTitleOverrides[String(th.thread_id ?? th.id)] ?? th.title,
      lastUpdated: th.last_updated ?? th.lastUpdated ?? new Date().toISOString(),
    })), [threadTitleOverrides]);

  const saveMsgsLS = useCallback((threadId, msgsArr) => {
    try { localStorage.setItem(`${LS_MSGS_PREFIX}${userId ?? "nouser"}_${threadId}`, JSON.stringify(msgsArr)); } catch {}
  }, [userId]);
  const loadMsgsLS = useCallback((threadId) => {
    try { return JSON.parse(localStorage.getItem(`${LS_MSGS_PREFIX}${userId ?? "nouser"}_${threadId}`)) || []; } catch { return []; }
  }, [userId]);

  // ─── load threads ───

  const loadThreads = useCallback(async () => {
    if (!token || !userId) return;
    try {
      setThreadsLoading(true);
      const resp = await fetchUserThreads({ onUnauthorized });
      if (!resp.ok) return;
      const data = await resp.json();
      setThreads(toClientThreads(data.threads || []));
    } catch {} finally {
      setThreadsLoading(false);
    }
  }, [token, userId, onUnauthorized, toClientThreads]);

  // Initial load
  useEffect(() => {
    if (!token || !userId) return;
    (async () => {
      await loadThreads();
      // URL ?tid= をチェック
      const params = new URLSearchParams(window.location.search);
      const fromParam = params.get("tid");
      if (fromParam) setCurrentThreadId(String(fromParam));
    })();
  }, [token, userId, loadThreads]);

  // URL ?tid= の変化を追跡
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const tid = params.get("tid");
    if (tid && String(tid) !== String(currentThreadId)) {
      setCurrentThreadId(String(tid));
    }
  }, [location.search, currentThreadId]);

  // ─── load messages ───

  const loadThreadMessages = useCallback(async (threadId) => {
    if (!token || !threadId) { setMessages([]); return; }
    if (String(threadId).startsWith("tmp-")) { setMessages(loadMsgsLS(threadId)); return; }

    setMessages([]);
    setMessagesLoading(true);
    try {
      const resp = await fetchThreadMessages(threadId, { onUnauthorized });
      if (resp.ok) {
        const data = await resp.json();
        const clientMessages = [];
        (data.messages || []).forEach((msg) => {
          clientMessages.push({ id: crypto.randomUUID(), role: "user", content: msg.question, time: msg.created_at, type: msg.type });
          clientMessages.push({ id: crypto.randomUUID(), role: "assistant", content: msg.answer, time: msg.created_at, rag_qa: msg.rag_qa || [], type: msg.type || (msg.rag_qa?.length > 0 ? "rag" : "") });
        });
        setMessages(clientMessages);
        saveMsgsLS(threadId, clientMessages);
      } else {
        setMessages(loadMsgsLS(threadId));
      }
    } catch {
      setMessages(loadMsgsLS(threadId));
    } finally {
      setMessagesLoading(false);
    }
  }, [token, loadMsgsLS, onUnauthorized, saveMsgsLS]);

  // Auto-load messages on thread switch
  useEffect(() => {
    if (currentThreadId) {
      if (skipNextThreadLoad.current) { skipNextThreadLoad.current = false; return; }
      loadThreadMessages(currentThreadId);
    } else {
      setMessages([]);
    }
  }, [currentThreadId, token, loadThreadMessages]);

  // Persist messages
  useEffect(() => {
    if (currentThreadId) saveMsgsLS(currentThreadId, messages);
  }, [messages, currentThreadId, saveMsgsLS]);

  // ─── thread CRUD ───

  const selectThread = useCallback((id) => {
    const tid = String(id);
    setCurrentThreadId(tid);
    navigate(`/home?tid=${encodeURIComponent(tid)}`);
    try { window.dispatchEvent(new CustomEvent("threadSelected", { detail: tid })); } catch {}
  }, [navigate]);

  const startNewChat = useCallback(() => {
    // Already on an empty draft thread: keep current state, don't create another.
    if (String(currentThreadId || "").startsWith("tmp-") && messages.length === 0) {
      navigate(`/home?tid=${encodeURIComponent(String(currentThreadId))}`);
      return;
    }

    const tempId = `tmp-${Date.now()}`;
    const nowIso = new Date().toISOString();
    const defaultTitle = t?.newChat || "新しいチャット";

    // Insert a visible draft thread immediately in the sidebar.
    setThreads((prev) => [
      { id: tempId, title: defaultTitle, lastUpdated: nowIso },
      ...prev,
    ]);

    setCurrentThreadId(tempId);
    setMessages([]);
    navigate(`/home?tid=${encodeURIComponent(tempId)}`);
  }, [navigate, t, currentThreadId, messages.length]);

  const renameThread = useCallback((id, title) => {
    const newTitle = title || t?.newChat || "新しいチャット";
    setThreads((prev) => prev.map((th) => String(th.id) === String(id) ? { ...th, title: newTitle } : th));
    setThreadTitleOverrides((prev) => {
      const updated = { ...prev, [String(id)]: newTitle };
      saveOverrides(updated);
      return updated;
    });
  }, [t, saveOverrides]);

  const removeThread = useCallback(async (id) => {
    const threadId = String(id);
    if (!window.confirm(t?.confirmDeleteThread || "スレッドを削除しますか？")) return;
    if (!token) return;
    try {
      const resp = await deleteThreadApi(threadId, { onUnauthorized });
      if (resp.ok) {
        await loadThreads();
        if (String(threadId) === String(currentThreadId)) {
          startNewChat();
        }
      }
    } catch (e) {
      console.error("Error deleting thread:", e);
      setThreads((prev) => prev.filter((th) => String(th.id) !== threadId));
      if (String(threadId) === String(currentThreadId)) startNewChat();
    }
  }, [token, currentThreadId, t, loadThreads, startNewChat, onUnauthorized]);

  // ─── event listeners ───

  useEffect(() => {
    const onThreadCreated = () => loadThreads();
    const onThreadUpdated = () => loadThreads();
    const onThreadTitleChanged = (e) => {
      const { threadId, title } = e.detail;
      setThreads((prev) => prev.map((th) => String(th.id) === String(threadId) ? { ...th, title } : th));
    };
    const onThreadSelected = (e) => {
      const tid = String(e.detail);
      if (tid !== String(currentThreadId)) setCurrentThreadId(tid);
    };
    const onThreadDeleted = (e) => {
      const { threadId } = e.detail || {};
      if (!threadId) return;
      if (String(threadId) === String(currentThreadId)) startNewChat();
      setThreads((prev) => prev.filter((th) => String(th.id) !== String(threadId)));
    };
    const onStartNewChat = () => startNewChat();

    window.addEventListener("threadCreated", onThreadCreated);
    window.addEventListener("threadUpdated", onThreadUpdated);
    window.addEventListener("threadTitleChanged", onThreadTitleChanged);
    window.addEventListener("threadSelected", onThreadSelected);
    window.addEventListener("threadDeleted", onThreadDeleted);
    window.addEventListener("startNewChat", onStartNewChat);
    return () => {
      window.removeEventListener("threadCreated", onThreadCreated);
      window.removeEventListener("threadUpdated", onThreadUpdated);
      window.removeEventListener("threadTitleChanged", onThreadTitleChanged);
      window.removeEventListener("threadSelected", onThreadSelected);
      window.removeEventListener("threadDeleted", onThreadDeleted);
      window.removeEventListener("startNewChat", onStartNewChat);
    };
  }, [loadThreads, currentThreadId, startNewChat]);

  return {
    threads, setThreads, currentThreadId, setCurrentThreadId,
    messages, setMessages,
    threadsLoading, messagesLoading,
    loadThreads, loadThreadMessages,
    selectThread, startNewChat, renameThread, removeThread,
    skipNextThreadLoad,
    toClientThreads, saveMsgsLS,
  };
}
