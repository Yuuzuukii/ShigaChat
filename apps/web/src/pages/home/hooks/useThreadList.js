import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { deleteThread as deleteThreadApi, fetchUserThreads } from "../../../pages/home/api";
import { toClientThreads as mapClientThreads } from "../utils/threadMapper";
import { getThreadTitleOverrides, saveThreadTitleOverrides } from "../utils/threadStorage";

export function useThreadList({
  token,
  userId,
  t,
  onUnauthorized,
  currentThreadId,
  setCurrentThreadId,
  messages,
  setMessages,
  notifyThreadFetchError,
  clearThreadFetchErrorNotice,
}) {
  const navigate = useNavigate();
  const [threads, setThreads] = useState([]);
  const [threadTitleOverrides, setThreadTitleOverrides] = useState(() =>
    getThreadTitleOverrides(userId)
  );

  useEffect(() => {
    setThreadTitleOverrides(getThreadTitleOverrides(userId));
  }, [userId]);

  const toClientThreads = useCallback(
    (serverThreads = []) => mapClientThreads(serverThreads, threadTitleOverrides),
    [threadTitleOverrides]
  );

  const loadThreads = useCallback(async (signal) => {
    if (!token || !userId) return;

    try {
      const response = await fetchUserThreads({ onUnauthorized, signal });
      if (signal?.aborted) return;
      if (!response.ok) {
        notifyThreadFetchError();
        return;
      }

      const data = await response.json();
      if (signal?.aborted) return;
      setThreads(toClientThreads(data.threads || []));
      clearThreadFetchErrorNotice();
    } catch (error) {
      if (signal?.aborted) return;
      if (!String(error?.message || "").includes("認証エラー")) {
        notifyThreadFetchError();
      }
    }
  }, [
    token,
    userId,
    onUnauthorized,
    toClientThreads,
    notifyThreadFetchError,
    clearThreadFetchErrorNotice,
  ]);

  const selectThread = useCallback(
    (id) => {
      const threadId = String(id);
      setCurrentThreadId(threadId);
      navigate(`/home?tid=${encodeURIComponent(threadId)}`);
    },
    [navigate, setCurrentThreadId]
  );

  const startNewChat = useCallback(() => {
    if (String(currentThreadId || "").startsWith("tmp-") && messages.length === 0) {
      navigate(`/home?tid=${encodeURIComponent(String(currentThreadId))}`);
      return;
    }

    const tempId = `tmp-${Date.now()}`;
    const nowIso = new Date().toISOString();
    const defaultTitle = t?.newChat || "新しいチャット";

    setThreads((prev) => [{ id: tempId, title: defaultTitle, lastUpdated: nowIso }, ...prev]);
    setCurrentThreadId(tempId);
    setMessages([]);
    navigate(`/home?tid=${encodeURIComponent(tempId)}`);
  }, [navigate, t, currentThreadId, messages.length, setCurrentThreadId, setMessages]);

  const renameThread = useCallback(
    (id, title) => {
      const newTitle = title || t?.newChat || "新しいチャット";
      setThreads((prev) =>
        prev.map((thread) =>
          String(thread.id) === String(id) ? { ...thread, title: newTitle } : thread
        )
      );
      setThreadTitleOverrides((prev) => {
        const updated = { ...prev, [String(id)]: newTitle };
        saveThreadTitleOverrides(userId, updated);
        return updated;
      });
    },
    [t, userId]
  );

  const removeThread = useCallback(
    async (id) => {
      const threadId = String(id);
      if (!token) return false;

      try {
        const response = await deleteThreadApi(threadId, { onUnauthorized });
        if (!response.ok) return false;

        await loadThreads();
        if (String(threadId) === String(currentThreadId)) {
          startNewChat();
        }
        return true;
      } catch (error) {
        console.error("Error deleting thread:", error);
        return false;
      }
    },
    [token, currentThreadId, loadThreads, startNewChat, onUnauthorized]
  );

  return {
    threads,
    loadThreads,
    selectThread,
    startNewChat,
    renameThread,
    removeThread,
  };
}
