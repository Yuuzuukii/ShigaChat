import { useCallback, useEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { toast } from "../../../features/common/Toaster";
import { useThreadList } from "./useThreadList";
import { useThreadMessages } from "./useThreadMessages";

export function useHomeChatState({ token, userId, t, onUnauthorized }) {
  const location = useLocation();
  const [currentThreadId, setCurrentThreadId] = useState(null);
  const skipNextThreadLoad = useRef(false);
  const hasShownThreadFetchErrorToastRef = useRef(false);

  const notifyThreadFetchError = useCallback(() => {
    if (hasShownThreadFetchErrorToastRef.current) return;
    hasShownThreadFetchErrorToastRef.current = true;
    toast.error(t?.threadFetchError || "スレッドの取得に失敗しました", { duration: 4000 });
  }, [t]);

  const clearThreadFetchErrorNotice = useCallback(() => {
    hasShownThreadFetchErrorToastRef.current = false;
  }, []);

  const messageState = useThreadMessages({
    token,
    userId,
    currentThreadId,
    skipNextThreadLoad,
    onUnauthorized,
    notifyThreadFetchError,
    clearThreadFetchErrorNotice,
  });

  const threadList = useThreadList({
    token,
    userId,
    t,
    onUnauthorized,
    currentThreadId,
    setCurrentThreadId,
    messages: messageState.messages,
    setMessages: messageState.setMessages,
    notifyThreadFetchError,
    clearThreadFetchErrorNotice,
  });
  const { loadThreads } = threadList;

  useEffect(() => {
    if (!token || !userId) return;
    const controller = new AbortController();
    loadThreads(controller.signal);
    return () => controller.abort();
  }, [token, userId, loadThreads]);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const threadId = params.get("tid");
    if (!threadId) return;
    setCurrentThreadId((prev) =>
      String(threadId) === String(prev) ? prev : String(threadId)
    );
  }, [location.search]);

  return {
    ...threadList,
    ...messageState,
    currentThreadId,
    setCurrentThreadId,
    skipNextThreadLoad,
  };
}
