/**
 * HomePage - S03 ホーム/チャット画面
 * ロジックは pages/home/hooks, utils + pages/home/api.js に集約済み
 */
import React, { useState, useRef, useCallback, useEffect } from "react";
import { useNavigate, useOutletContext } from "react-router-dom";
import { Plus } from "lucide-react";
import ChatMessages from "../../features/home/ChatMessages";
import ChatInput from "../../features/home/ChatInput";
import { postGetAnswerStream, postAction } from "./api";
import { languageCodeToLabel } from "../../config/i18n";
import { toast } from "../../features/common/Toaster";
import { readResponseErrorMessage } from "../../api/apiErrors";
import { moveThreadMessages } from "../../pages/home/utils/threadStorage";

const NETWORK_ERROR_PATTERNS = [
  /failed to fetch/i,
  /network\s?error/i,
  /load failed/i,
];

const DB_ERROR_PATTERNS = [
  /データベース/i,
  /\bdb\b/i,
  /\bdatabase\b/i,
  /psycopg/i,
  /connection refused/i,
  /could not connect/i,
  /connection to server/i,
  /server closed the connection/i,
];

const ANSWER_GENERATION_ERROR_PATTERNS = [
  /api[-_\s]?key/i,
  /apiキー/i,
  /openai/i,
  /openai_api_key/i,
  /insufficient_quota/i,
  /rate limit/i,
  /model/i,
];

const LANGUAGE_TRANSLATION_ERROR_PATTERNS = [
  /language or translation error/i,
  /言語または翻訳エラー/i,
  /未対応の言語です/i,
  /unsupported language/i,
  /could not detect the language/i,
  /言語を特定できませんでした/i,
];

function errorLikeToString(error) {
  return String(
    (error &&
      typeof error === "object" &&
      "message" in error &&
      error.message) ||
      error ||
      ""
  ).trim();
}

function normalizeRequestError(error, t) {
  const fallback = t?.answerGenerationFailed || "回答を生成できませんでした";
  const serverMessage = t?.errorServerConnection || "サーバーに接続できません";
  const dbMessage =
    t?.databaseConnectionError || "データベースに接続できません";
  const raw = errorLikeToString(error);
  const isNetworkError =
    error instanceof TypeError ||
    NETWORK_ERROR_PATTERNS.some((pattern) => pattern.test(raw));
  const isAnswerGenerationError = ANSWER_GENERATION_ERROR_PATTERNS.some(
    (pattern) => pattern.test(raw)
  );
  const isLanguageOrTranslationError = LANGUAGE_TRANSLATION_ERROR_PATTERNS.some(
    (pattern) => pattern.test(raw)
  );

  if (isNetworkError) return serverMessage;
  if (isLanguageOrTranslationError)
    return t?.languageOrTranslationError || fallback;
  if (isAnswerGenerationError) return fallback;
  if (DB_ERROR_PATTERNS.some((pattern) => pattern.test(raw))) return dbMessage;
  return raw || fallback;
}

function getActionErrorFallback(actionType, t) {
  if (actionType === "translate")
    return t?.translationFailed || "翻訳に失敗しました";
  if (actionType === "summarize")
    return t?.summarizeFailed || "要約に失敗しました";
  if (actionType === "simplify")
    return t?.rewriteFailed || "書き換えに失敗しました";
  return t?.failtogetanswer || "回答の取得に失敗しました";
}

function normalizeActionError(error, actionType, t) {
  const fallback = getActionErrorFallback(actionType, t);
  const raw = errorLikeToString(error);
  const isNetworkError =
    error instanceof TypeError ||
    NETWORK_ERROR_PATTERNS.some((pattern) => pattern.test(raw));
  const isActionInternalError =
    /^action failed:/i.test(raw) ||
    /openai/i.test(raw) ||
    /api[-_\s]?key/i.test(raw);

  if (isNetworkError) return fallback;
  if (isActionInternalError) return fallback;
  if (DB_ERROR_PATTERNS.some((pattern) => pattern.test(raw))) return fallback;
  return raw || fallback;
}

function parseSseEvent(rawEvent) {
  const lines = rawEvent.split("\n");
  let eventName = "";
  const dataLines = [];

  for (const line of lines) {
    if (line.startsWith("event:")) eventName = line.slice(6).trim();
    if (line.startsWith("data:")) dataLines.push(line.slice(5).trim());
  }

  if (!eventName) return null;

  try {
    return {
      eventName,
      data: dataLines.length ? JSON.parse(dataLines.join("\n")) : {},
    };
  } catch {
    return { eventName, data: {} };
  }
}

export default function HomePage() {
  const { language, t, token, userId, threadHook } = useOutletContext();
  const navigate = useNavigate();
  const {
    currentThreadId,
    setCurrentThreadId,
    messages,
    setMessages,
    messagesLoading,
    startNewChat,
    renameThread,
    loadThreads,
    skipNextThreadLoad,
  } = threadHook;

  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [errorMessageKey, setErrorMessageKey] = useState("");
  const [suppressThreadSwitchAnimation, setSuppressThreadSwitchAnimation] =
    useState(false);

  const messagesEndRef = useRef(null);
  const messagesContainerRef = useRef(null);
  const needsThreadSwitchScrollRef = useRef(false);
  const prevThreadIdRef = useRef(currentThreadId);

  const scrollToBottom = useCallback(() => {
    try {
      const el = messagesContainerRef.current;
      if (el) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
      else
        messagesEndRef.current?.scrollIntoView({
          behavior: "smooth",
          block: "end",
        });
    } catch {}
  }, []);

  const scrollToBottomImmediate = useCallback(() => {
    try {
      const el = messagesContainerRef.current;
      if (el) el.scrollTop = el.scrollHeight;
      else messagesEndRef.current?.scrollIntoView({ block: "end" });
    } catch {}
  }, []);

  // Thread switch detection
  useEffect(() => {
    if (prevThreadIdRef.current !== currentThreadId) {
      needsThreadSwitchScrollRef.current = true;
      setSuppressThreadSwitchAnimation(true);
      prevThreadIdRef.current = currentThreadId;
    }
  }, [currentThreadId]);

  // Keep view fixed at latest message when switching threads.
  useEffect(() => {
    if (!needsThreadSwitchScrollRef.current) return;
    if (messagesLoading) return;
    const raf = requestAnimationFrame(() => {
      scrollToBottomImmediate();
      needsThreadSwitchScrollRef.current = false;
    });
    return () => cancelAnimationFrame(raf);
  }, [messagesLoading, messages.length, scrollToBottomImmediate]);

  // Disable message entrance animation only for the first paint after switching threads.
  useEffect(() => {
    if (!suppressThreadSwitchAnimation) return;
    if (messagesLoading) return;
    const raf = requestAnimationFrame(() => {
      setSuppressThreadSwitchAnimation(false);
    });
    return () => cancelAnimationFrame(raf);
  }, [suppressThreadSwitchAnimation, messagesLoading, messages.length]);

  const onUnauthorized = useCallback(() => {
    navigate("/login");
  }, [navigate]);

  useEffect(() => {
    if (input.trim()) {
      setErrorMessage("");
      setErrorMessageKey("");
    }
  }, [input]);

  // ─── Send message ───
  const sendMessage = async () => {
    if (!token) {
      setErrorMessageKey("errorLogin");
      setErrorMessage("");
      onUnauthorized();
      return;
    }
    const text = input.trim();
    if (!text) {
      setErrorMessageKey("enterquestion");
      setErrorMessage("");
      return;
    }

    const tidFromUrl = (() => {
      try {
        return new URLSearchParams(window.location.search).get("tid");
      } catch {
        return null;
      }
    })();
    let threadId = currentThreadId || tidFromUrl;
    if (threadId && String(threadId) !== String(currentThreadId)) {
      setCurrentThreadId(String(threadId));
    }
    if (!threadId) {
      const id = `tmp-${Date.now()}`;
      skipNextThreadLoad.current = true;
      setCurrentThreadId(id);
      threadId = id;
      setMessages([]);
    }

    const userMsg = {
      id: crypto.randomUUID(),
      role: "user",
      content: text,
      time: new Date().toISOString(),
    };
    const typingMsg = {
      id: "typing",
      role: "assistant",
      content: "",
      typing: true,
      progress: 8,
      progressText: t?.preparingAnswer || "回答の準備をしています…",
    };
    const isFirstMessage = messages.length === 0;

    setMessages((prev) => [...prev, userMsg, typingMsg]);
    setTimeout(scrollToBottomImmediate, 0);
    setInput("");
    setLoading(true);
    setErrorMessage("");
    setErrorMessageKey("");

    try {
      const isTemp = String(threadId).startsWith("tmp-");
      const payload = isTemp
        ? { text }
        : {
            thread_id: Number(threadId),
            text,
          };

      const res = await postGetAnswerStream(payload, { onUnauthorized });
      if (!res.ok) {
        const detail = await readResponseErrorMessage(res);
        throw new Error(
          detail || t?.failtogetanswer || "回答の取得に失敗しました"
        );
      }
      if (!res.body) {
        throw new Error("Streaming response is empty");
      }

      const progressLabels = {
        thread_ready: {
          text: t?.preparingAnswer || "回答の準備をしています…",
          progress: 10,
        },
        history_loaded: {
          text: t?.progressHistory || "会話履歴を読み込んでいます…",
          progress: 25,
        },
        language_detected: {
          text: t?.progressUnderstanding || "質問内容を整理しています…",
          progress: 40,
        },
        vector_search_done: {
          text: t?.progressSearching || "関連情報を確認しています…",
          progress: 60,
        },
        reference_selected: {
          text: t?.progressSelecting || "参考情報を選んでいます…",
          progress: 75,
        },
        answer_start: {
          text: t?.progressComposing || "回答をまとめています…",
          progress: 90,
        },
      };

      const updateTypingMessage = (updater) => {
        setMessages((prev) =>
          prev.map((message) =>
            message.id === "typing"
              ? { ...message, ...updater(message) }
              : message
          )
        );
      };

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let finalPayload = null;
      let resolvedThreadId = null;

      // Temp thread → server-assigned ID migration
      const handleThreadReady = (data) => {
        if (!(isTemp && data?.thread_id != null)) return;
        const newId = String(data.thread_id);
        if (newId === String(threadId)) return;
        resolvedThreadId = newId;
      };

      const processEvent = (rawEvent) => {
        const parsed = parseSseEvent(rawEvent);
        if (!parsed) return;
        const { eventName, data } = parsed;

        if (eventName === "thread_ready") {
          handleThreadReady(data);
          return;
        }

        if (eventName === "token") {
          updateTypingMessage((message) => ({
            typing: false,
            progress: 92,
            progressText: t?.progressComposing || "回答を生成しています…",
            content: `${message.content || ""}${data.content || ""}`,
          }));
          return;
        }

        if (eventName === "end") {
          finalPayload = data;
          return;
        }

        if (eventName === "error") {
          throw new Error(data.message || "Streaming failed");
        }

        if (progressLabels[eventName]) {
          updateTypingMessage(() => ({
            progress: progressLabels[eventName].progress,
            progressText: progressLabels[eventName].text,
          }));
        }
      };

      while (true) {
        const { value, done } = await reader.read();
        buffer += decoder.decode(value || new Uint8Array(), { stream: !done });
        buffer = buffer.replace(/\r\n/g, "\n");

        while (buffer.includes("\n\n")) {
          const boundaryIndex = buffer.indexOf("\n\n");
          const rawEvent = buffer.slice(0, boundaryIndex);
          buffer = buffer.slice(boundaryIndex + 2);
          if (rawEvent.trim()) processEvent(rawEvent);
        }

        if (done) break;
      }

      if (!finalPayload) {
        throw new Error("Streaming ended without completion event");
      }

      if (!resolvedThreadId && isTemp && finalPayload?.thread_id != null) {
        resolvedThreadId = String(finalPayload.thread_id);
      }

      if (resolvedThreadId && resolvedThreadId !== String(threadId)) {
        moveThreadMessages(userId, threadId, resolvedThreadId);

        skipNextThreadLoad.current = true;
        setCurrentThreadId(resolvedThreadId);
        threadId = resolvedThreadId;
        navigate(`/home?tid=${encodeURIComponent(resolvedThreadId)}`, {
          replace: true,
        });
      }

      updateTypingMessage(() => ({
        typing: false,
        progress: null,
        progressText: null,
        content: finalPayload.answer || "",
        time: new Date().toISOString(),
        rag_qa: finalPayload.meta?.references || [],
        type: "rag",
      }));

      if (isFirstMessage) {
        const serverTitle =
          typeof finalPayload?.thread_title === "string"
            ? finalPayload.thread_title.trim()
            : "";
        const newTitle = serverTitle || t?.newChat || "New Chat";
        renameThread(threadId, newTitle);
      }

      try {
        await loadThreads();
      } catch {}
    } catch (e) {
      setMessages((prev) => prev.filter((m) => m.id !== "typing"));
      const normalizedMessage = normalizeRequestError(e, t);
      setErrorMessageKey("");
      setErrorMessage(normalizedMessage);
      toast.error(normalizedMessage, { duration: 4000 });
    } finally {
      setLoading(false);
    }
  };

  // ─── Action (translate / summarize / simplify) ───
  const applyAction = async (type, targetLangOverride = null) => {
    if (!token) {
      setErrorMessageKey("errorLogin");
      setErrorMessage("");
      onUnauthorized();
      return;
    }
    scrollToBottom();

    const lastAssistantIdx = [...messages]
      .map((m, i) => ({ m, i }))
      .reverse()
      .find((x) => x.m.role === "assistant" && !x.m.typing)?.i;
    if (lastAssistantIdx == null) {
      setErrorMessage(t?.noRecentAnswer || "直近の回答がありません");
      return;
    }

    let lastUserIdx = -1;
    for (let i = lastAssistantIdx - 1; i >= 0; i--) {
      if (messages[i].role === "user") {
        lastUserIdx = i;
        break;
      }
    }
    const questionText =
      lastUserIdx >= 0 ? messages[lastUserIdx].content || "" : "";
    const answerText = messages[lastAssistantIdx].content || "";

    const actionLabels = {
      translate: t?.actionTranslate,
      summarize: t?.actionSummarize,
      simplify: t?.actionSimplify,
    };
    const actionText = `${t?.actionApplyPrefix || ""}${actionLabels[type]}${
      type === "translate"
        ? ` (${
            languageCodeToLabel[targetLangOverride || language] ||
            targetLangOverride ||
            language
          })`
        : ""
    }${t?.actionApplySuffix || ""}`;

    const actionMsg = {
      id: crypto.randomUUID(),
      role: "user",
      type: "action",
      content: actionText,
      time: new Date().toISOString(),
    };
    const typingMsg = {
      id: "action-typing",
      role: "assistant",
      type: "action",
      content: "…",
      typing: true,
    };
    setMessages((prev) => [...prev, actionMsg, typingMsg]);
    setTimeout(scrollToBottomImmediate, 0);

    setActionLoading(true);
    try {
      let threadIdNum = null;
      if (currentThreadId && !String(currentThreadId).startsWith("tmp-")) {
        const n = Number(currentThreadId);
        if (Number.isFinite(n)) threadIdNum = n;
      }
      const res = await postAction(
        {
          action: type,
          question: questionText,
          answer: answerText,
          target_lang: targetLangOverride || language,
          thread_id: threadIdNum,
          action_label: actionText,
        },
        { onUnauthorized }
      );

      if (!res.ok) {
        const detail = await readResponseErrorMessage(res);
        throw new Error(detail || getActionErrorFallback(type, t));
      }
      const data = await res.json();
      const asstMsg = {
        id: crypto.randomUUID(),
        role: "assistant",
        content: data?.result || "",
        time: new Date().toISOString(),
      };
      setMessages((prev) => [
        ...prev.filter((m) => m.id !== "action-typing"),
        asstMsg,
      ]);

      // Thread ID migration
      if (data?.thread_id != null) {
        const newId = String(data.thread_id);
        const oldId = String(currentThreadId || "");
        if (newId !== oldId) {
          setCurrentThreadId(newId);
          navigate(`/home?tid=${encodeURIComponent(newId)}`, { replace: true });
        }
        try {
          await loadThreads();
        } catch {}
      }
    } catch (e) {
      setMessages((prev) => prev.filter((m) => m.id !== "action-typing"));
      const normalizedMessage = normalizeActionError(e, type, t);
      setErrorMessageKey("");
      setErrorMessage(normalizedMessage);
      toast.error(normalizedMessage, { duration: 4000 });
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <div className="h-full w-full bg-gradient-to-br from-blue-50 via-white to-cyan-50 overflow-hidden">
      <div className="h-full flex justify-center">
        <main className="h-full w-full flex">
          <div className="flex-1 min-h-0 max-h-full backdrop-blur-sm relative">
            {/* 新しいチャットボタン */}
            <div className="absolute top-3 left-3 z-10">
              <button
                onClick={startNewChat}
                className="flex items-center gap-2 px-3 py-2 rounded-full bg-blue-600 text-white hover:bg-blue-700 transition-all duration-150 hover:-translate-y-px hover:shadow-md active:translate-y-px active:shadow-none group text-sm font-medium"
                title={t?.newChat || "新しいチャット"}
              >
                <Plus className="h-4 w-4 group-hover:scale-110 transition-transform" />
                <span>{t?.newChat || "新しいチャット"}</span>
              </button>
            </div>

            <div className="h-full flex flex-col">
              <ChatMessages
                messages={messages}
                messagesLoading={messagesLoading}
                currentThreadId={currentThreadId}
                suppressEntranceAnimation={suppressThreadSwitchAnimation}
                t={t}
                navigate={navigate}
                messagesContainerRef={messagesContainerRef}
                messagesEndRef={messagesEndRef}
              />
              <ChatInput
                input={input}
                setInput={setInput}
                loading={loading}
                actionLoading={actionLoading}
                errorMessage={
                  errorMessageKey
                    ? t?.[errorMessageKey] || errorMessage
                    : errorMessage
                }
                t={t}
                onSend={sendMessage}
                onApplyAction={applyAction}
              />
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
