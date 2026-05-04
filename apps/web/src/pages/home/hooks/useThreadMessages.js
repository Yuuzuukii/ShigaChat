import { useCallback, useEffect, useRef, useState } from "react";
import { fetchThreadMessages } from "../../../pages/home/api";
import { toClientMessages } from "../utils/threadMapper";
import { getThreadMessages, saveThreadMessages } from "../utils/threadStorage";

export function useThreadMessages({
  token,
  userId,
  currentThreadId,
  skipNextThreadLoad,
  onUnauthorized,
  notifyThreadFetchError,
  clearThreadFetchErrorNotice,
}) {
  const [messages, setMessages] = useState([]);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const requestIdRef = useRef(0);

  const loadThreadMessages = useCallback(
    async (threadId, signal) => {
      const requestId = ++requestIdRef.current;
      const isCurrentRequest = () => requestId === requestIdRef.current && !signal?.aborted;

      if (!token || !threadId) {
        if (isCurrentRequest()) setMessages([]);
        return;
      }

      if (String(threadId).startsWith("tmp-")) {
        if (isCurrentRequest()) setMessages(getThreadMessages(userId, threadId));
        return;
      }

      setMessages([]);
      setMessagesLoading(true);
      try {
        const response = await fetchThreadMessages(threadId, { onUnauthorized, signal });
        if (!isCurrentRequest()) return;
        if (response.ok) {
          const data = await response.json();
          if (!isCurrentRequest()) return;
          const clientMessages = toClientMessages(data.messages || []);
          setMessages(clientMessages);
          saveThreadMessages(userId, threadId, clientMessages);
          clearThreadFetchErrorNotice();
        } else {
          setMessages(getThreadMessages(userId, threadId));
          notifyThreadFetchError();
        }
      } catch (error) {
        if (signal?.aborted) return;
        setMessages(getThreadMessages(userId, threadId));
        if (!String(error?.message || "").includes("認証エラー")) {
          notifyThreadFetchError();
        }
      } finally {
        if (isCurrentRequest()) setMessagesLoading(false);
      }
    },
    [
      token,
      userId,
      onUnauthorized,
      notifyThreadFetchError,
      clearThreadFetchErrorNotice,
    ]
  );

  useEffect(() => {
    if (currentThreadId) {
      if (skipNextThreadLoad.current) {
        skipNextThreadLoad.current = false;
        return;
      }
      const controller = new AbortController();
      loadThreadMessages(currentThreadId, controller.signal);
      return () => controller.abort();
    } else {
      requestIdRef.current += 1;
      setMessages([]);
    }
  }, [currentThreadId, token, loadThreadMessages, skipNextThreadLoad]);

  useEffect(() => {
    if (currentThreadId) saveThreadMessages(userId, currentThreadId, messages);
  }, [messages, currentThreadId, userId]);

  return {
    messages,
    setMessages,
    messagesLoading,
  };
}
