/**
 * HomePage - S03 ホーム/チャット画面
 * home.js(1563行)から分割リファクタ。ロジックはuseThreadsフック + services/api.jsに移行済み
 */
import React, { useState, useRef, useCallback, useEffect } from "react";
import { useNavigate, useOutletContext } from "react-router-dom";
import { motion } from "framer-motion";
import { Plus } from "lucide-react";
import { Card } from "../components/ui/card";
import ChatMessages from "../components/chat/ChatMessages";
import ChatInput from "../components/chat/ChatInput";
import { postGetAnswer, postAction, fetchUserThreads } from "../services/api";
import { languageCodeToLabel } from "../config/i18n";
import { toast } from "../lib/utils";

const DEFAULT_SIMILARITY = 0.3;
const LS_MSGS_PREFIX = "chat_msgs_";

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
    (error && typeof error === "object" && "message" in error && error.message) ||
      error ||
      ""
  ).trim();
}

function normalizeErrorDetail(detail) {
  if (typeof detail === "string") return detail.trim();
  if (Array.isArray(detail)) {
    return detail
      .map((item) => {
        if (typeof item === "string") return item.trim();
        if (item && typeof item === "object") {
          if (typeof item.msg === "string") return item.msg.trim();
          if (typeof item.message === "string") return item.message.trim();
        }
        return "";
      })
      .filter(Boolean)
      .join(" ")
      .trim();
  }
  if (detail && typeof detail === "object") {
    if (typeof detail.message === "string") return detail.message.trim();
    if (typeof detail.msg === "string") return detail.msg.trim();
    try { return JSON.stringify(detail); } catch {}
  }
  return "";
}

async function readResponseErrorMessage(response) {
  try {
    const payload = await response.clone().json();
    const fromJson = normalizeErrorDetail(
      payload?.detail ?? payload?.error ?? payload?.message ?? payload
    );
    if (fromJson) return fromJson;
  } catch {}

  try {
    const text = (await response.text()).trim();
    if (text) return text;
  } catch {}

  return "";
}

function normalizeRequestError(error, t) {
  const fallback = t?.answerGenerationFailed || "回答を生成できませんでした";
  const serverMessage = t?.errorServerConnection || "サーバーに接続できません";
  const dbMessage = t?.databaseConnectionError || "データベースに接続できません";
  const raw = errorLikeToString(error);
  const isNetworkError =
    error instanceof TypeError ||
    NETWORK_ERROR_PATTERNS.some((pattern) => pattern.test(raw));
  const isAnswerGenerationError =
    ANSWER_GENERATION_ERROR_PATTERNS.some((pattern) => pattern.test(raw));
  const isLanguageOrTranslationError =
    LANGUAGE_TRANSLATION_ERROR_PATTERNS.some((pattern) => pattern.test(raw));

  if (isNetworkError) return serverMessage;
  if (isLanguageOrTranslationError) return t?.languageOrTranslationError || fallback;
  if (isAnswerGenerationError) return fallback;
  if (DB_ERROR_PATTERNS.some((pattern) => pattern.test(raw))) return dbMessage;
  return raw || fallback;
}

function getActionErrorFallback(actionType, t) {
  if (actionType === "translate") return t?.translationFailed || "翻訳に失敗しました";
  if (actionType === "summarize") return t?.summarizeFailed || "要約に失敗しました";
  if (actionType === "simplify") return t?.rewriteFailed || "書き換えに失敗しました";
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

export default function HomePage() {
  const { language, t, threadHook } = useOutletContext();
  const navigate = useNavigate();
  const {
    setThreads, currentThreadId, setCurrentThreadId,
    messages, setMessages, messagesLoading,
    startNewChat, renameThread,
    skipNextThreadLoad, toClientThreads,
  } = threadHook;

  const userId = (() => { try { return JSON.parse(localStorage.getItem("user"))?.id; } catch { return null; } })();
  const token = localStorage.getItem("token");

  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [errorMessageKey, setErrorMessageKey] = useState("");
  const [actionMessage, setActionMessage] = useState("");
  const [suppressThreadSwitchAnimation, setSuppressThreadSwitchAnimation] = useState(false);

  const [similarity, setSimilarity] = useState(() => {
    const v = localStorage.getItem("rag_similarity_threshold");
    const n = v != null ? parseFloat(v) : DEFAULT_SIMILARITY;
    return Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : DEFAULT_SIMILARITY;
  });

  const messagesEndRef = useRef(null);
  const messagesContainerRef = useRef(null);
  const needsThreadSwitchScrollRef = useRef(false);
  const prevThreadIdRef = useRef(currentThreadId);

  const scrollToBottom = useCallback(() => {
    try {
      const el = messagesContainerRef.current;
      if (el) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
      else messagesEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
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

  const handleSimilarityChange = (e) => {
    const n = parseFloat(e.target.value);
    const clamped = Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : DEFAULT_SIMILARITY;
    setSimilarity(clamped);
    try { localStorage.setItem("rag_similarity_threshold", String(clamped)); } catch {}
  };

  useEffect(() => {
    if (input.trim()) {
      setErrorMessage("");
      setErrorMessageKey("");
    }
  }, [input]);

  // ─── Send message ───
  const sendMessage = async () => {
    if (!token) { setErrorMessageKey("errorLogin"); setErrorMessage(""); onUnauthorized(); return; }
    const text = input.trim();
    if (!text) {
      setErrorMessageKey("enterquestion");
      setErrorMessage("");
      return;
    }

    const tidFromUrl = (() => {
      try { return new URLSearchParams(window.location.search).get("tid"); } catch { return null; }
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

    const userMsg = { id: crypto.randomUUID(), role: "user", content: text, time: new Date().toISOString() };
    const typingMsg = { id: "typing", role: "assistant", content: "…", typing: true };
    const isFirstMessage = messages.length === 0;

    setMessages((prev) => [...prev, userMsg, typingMsg]);
    setTimeout(scrollToBottomImmediate, 0);
    setInput("");
    setLoading(true);
    setErrorMessage("");
    setErrorMessageKey("");

    try {
      const isTemp = String(threadId).startsWith("tmp-");
      const payload = isTemp ? { text, similarity_threshold: similarity } : { thread_id: Number(threadId), text, similarity_threshold: similarity };

      const res = await postGetAnswer(payload, { onUnauthorized });
      if (!res.ok) {
        const detail = await readResponseErrorMessage(res);
        throw new Error(detail || t?.failtogetanswer || "回答の取得に失敗しました");
      }
      const data = await res.json();

      // Temp thread → server-assigned ID migration
      if (isTemp && data?.thread_id != null) {
        const newId = String(data.thread_id);
        if (newId !== String(threadId)) {
          try {
            const oldKey = `${LS_MSGS_PREFIX}${userId ?? "nouser"}_${threadId}`;
            const newKey = `${LS_MSGS_PREFIX}${userId ?? "nouser"}_${newId}`;
            const oldVal = localStorage.getItem(oldKey);
            if (oldVal !== null) { localStorage.setItem(newKey, oldVal); localStorage.removeItem(oldKey); }
          } catch {}
          // Keep current optimistic messages; avoid reload flicker on tmp -> real thread migration.
          skipNextThreadLoad.current = true;
          setCurrentThreadId(newId);
          threadId = newId;
          navigate(`/home?tid=${encodeURIComponent(newId)}`, { replace: true });
          try { window.dispatchEvent(new CustomEvent("threadSelected", { detail: newId })); } catch {}
        }
      }

      const asstMsg = {
        id: crypto.randomUUID(), role: "assistant", content: data.answer,
        time: new Date().toISOString(),
        rag_qa: data.meta?.references || [], type: data.type || "",
      };
      setMessages((prev) => [...prev.filter((m) => m.id !== "typing"), asstMsg]);

      if (isFirstMessage) {
        const serverTitle = typeof data?.thread_title === "string" ? data.thread_title.trim() : "";
        const newTitle = serverTitle || (t?.newChat || "New Chat");
        renameThread(threadId, newTitle);
        try { window.dispatchEvent(new CustomEvent("threadTitleChanged", { detail: { threadId, title: newTitle } })); } catch {}
      }

      // Refresh thread list
      try {
        const resp = await fetchUserThreads({ onUnauthorized });
        if (resp.ok) {
          const data2 = await resp.json();
          setThreads(toClientThreads(data2.threads || []));
          try { window.dispatchEvent(new CustomEvent("threadUpdated")); } catch {}
        }
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
    if (!token) { setErrorMessageKey("errorLogin"); setErrorMessage(""); onUnauthorized(); return; }
    scrollToBottom();

    const lastAssistantIdx = [...messages].map((m, i) => ({ m, i })).reverse().find((x) => x.m.role === "assistant" && !x.m.typing)?.i;
    if (lastAssistantIdx == null) { setErrorMessage(t?.noRecentAnswer || "直近の回答がありません"); return; }

    let lastUserIdx = -1;
    for (let i = lastAssistantIdx - 1; i >= 0; i--) { if (messages[i].role === "user") { lastUserIdx = i; break; } }
    const questionText = lastUserIdx >= 0 ? messages[lastUserIdx].content || "" : "";
    const answerText = messages[lastAssistantIdx].content || "";

    const actionLabels = { translate: t?.actionTranslate, summarize: t?.actionSummarize, simplify: t?.actionSimplify };
    const actionText = `${t?.actionApplyPrefix || ""}${actionLabels[type]}${type === "translate" ? ` (${languageCodeToLabel[targetLangOverride || language] || targetLangOverride || language})` : ""}${t?.actionApplySuffix || ""}`;

    const actionMsg = { id: crypto.randomUUID(), role: "user", type: "action", content: actionText, time: new Date().toISOString() };
    const typingMsg = { id: "action-typing", role: "assistant", type: "action", content: "…", typing: true };
    setMessages((prev) => [...prev, actionMsg, typingMsg]);
    setTimeout(scrollToBottomImmediate, 0);

    setActionLoading(true);
    setActionMessage("");
    try {
      let threadIdNum = null;
      if (currentThreadId && !String(currentThreadId).startsWith("tmp-")) {
        const n = Number(currentThreadId);
        if (Number.isFinite(n)) threadIdNum = n;
      }
      const res = await postAction({
        action: type, question: questionText, answer: answerText,
        target_lang: targetLangOverride || language, thread_id: threadIdNum, action_label: actionText,
      }, { onUnauthorized });

      if (!res.ok) {
        const detail = await readResponseErrorMessage(res);
        throw new Error(detail || getActionErrorFallback(type, t));
      }
      const data = await res.json();
      const asstMsg = { id: crypto.randomUUID(), role: "assistant", content: data?.result || "", time: new Date().toISOString() };
      setMessages((prev) => [...prev.filter((m) => m.id !== "action-typing"), asstMsg]);

      // Thread ID migration
      if (data?.thread_id != null) {
        const newId = String(data.thread_id);
        const oldId = String(currentThreadId || "");
        if (newId !== oldId) {
          setCurrentThreadId(newId);
          navigate(`/home?tid=${encodeURIComponent(newId)}`, { replace: true });
          try { window.dispatchEvent(new CustomEvent("threadSelected", { detail: newId })); } catch {}
        }
        try {
          const resp = await fetchUserThreads({ onUnauthorized });
          if (resp.ok) { const d = await resp.json(); setThreads(toClientThreads(d.threads || [])); }
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
        <motion.main
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: "easeOut" }}
          className="h-full w-full flex"
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.3, duration: 0.4 }}
            className="flex-1 min-h-0 max-h-full backdrop-blur-sm relative"
          >
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

            {/* 絞り込み強度 */}
            <div className="absolute top-3 left-1/2 transform -translate-x-1/2 z-10">
              <Card className="flex items-center gap-2 px-3 py-1.5 bg-white/90 backdrop-blur-sm border-zinc-200">
                <span className="text-xs font-medium text-zinc-700 whitespace-nowrap">{t?.similarityLabel || "一致の厳しさ"}</span>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-zinc-500">{t?.similarityLow || "弱い"}</span>
                  <input className="h-1.5 w-20 cursor-pointer appearance-none rounded-full bg-gradient-to-r from-blue-100 to-blue-200 accent-blue-600" type="range" min="0" max="1" step="0.05" value={similarity} onChange={handleSimilarityChange} />
                  <span className="text-xs text-zinc-500">{t?.similarityHigh || "強い"}</span>
                </div>
                <span className="rounded-md bg-blue-100 px-1.5 py-0.5 text-xs font-mono text-blue-700">{similarity.toFixed(2)}</span>
              </Card>
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
                input={input} setInput={setInput}
                loading={loading} actionLoading={actionLoading}
                errorMessage={errorMessageKey ? (t?.[errorMessageKey] || errorMessage) : errorMessage}
                actionMessage={actionMessage}
                t={t} onSend={sendMessage} onApplyAction={applyAction}
                similarity={similarity} onSimilarityChange={handleSimilarityChange}
              />
            </div>
          </motion.div>
        </motion.main>
      </div>
    </div>
  );
}
