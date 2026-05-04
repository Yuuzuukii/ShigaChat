/**
 * MessageBubble - 個別メッセージの表示（ユーザー/アシスタント）
 */
import React from "react";
import {
  Lightbulb,
  FileText,
  Clock,
  ChevronDown,
  ChevronRight,
  AlertTriangle,
  Sparkles,
  ExternalLink,
} from "lucide-react";
import ChatRichText from "./ChatRichText";

function formatDateTime(val) {
  if (!val) return null;
  try {
    const s = String(val);
    const isoish = s.includes("T") || s.endsWith("Z") ? s : s.replace(" ", "T");
    const d = new Date(isoish);
    if (isNaN(d.getTime())) return s;
    return d.toLocaleString().replace(/\u30fb/g, " ");
  } catch {
    return String(val);
  }
}

export default function MessageBubble({
  message: m,
  index: _index,
  t,
  navigate,
  suppressEntranceAnimation = false,
}) {
  if (suppressEntranceAnimation) {
    return (
      <div className={`mb-6 ${m.role === "user" ? "flex justify-end" : ""}`}>
        {m.role === "user" ? (
          <UserBubble m={m} t={t} />
        ) : (
          <AssistantBubble m={m} t={t} navigate={navigate} />
        )}
      </div>
    );
  }

  return (
    <div
      key={m.id}
      className={`mb-6 transition-opacity duration-200 ${m.role === "user" ? "flex justify-end" : ""}`}
    >
      {m.role === "user" ? (
        <UserBubble m={m} t={t} />
      ) : (
        <AssistantBubble m={m} t={t} navigate={navigate} />
      )}
    </div>
  );
}

function UserBubble({ m, t }) {
  const isAction = m.type === "action";
  return (
    <div
      className={`max-w-[80%] rounded-2xl border p-4 shadow-sm ${isAction ? "bg-blue-300 bg-gradient-to-br from-blue-100 to-zinc-100/60 text-blue-900 shadow-blue-100" : "border-blue-200 bg-gradient-to-br from-blue-50 to-blue-100/50 text-blue-900 shadow-blue-100"}`}
    >
      <div
        className={`mb-2 flex items-center gap-1.5 ${isAction ? "text-blue-600" : "text-zinc-500"}`}
      >
        {isAction && (
          <div className="flex h-4 w-4 items-center justify-center rounded-full bg-blue-600">
            <Sparkles className="h-2.5 w-2.5 text-white" />
          </div>
        )}
        <span className="text-[10px] font-semibold uppercase tracking-wider">
          {isAction ? t?.actionLabel || "アクション" : t?.you || "あなた"}
        </span>
      </div>
      <div className="text-sm leading-relaxed">{m.content}</div>
    </div>
  );
}

function AssistantBubble({ m, t, navigate }) {
  return (
    <div className="w-full">
      <div className="mb-3 flex items-center gap-2">
        <div className="flex h-7 w-7 items-center justify-center rounded-full bg-gradient-to-br from-blue-600 to-blue-700">
          <Lightbulb className="h-4 w-4 text-white" />
        </div>
        <span className="text-sm font-medium text-zinc-700">{t?.assistant || "アシスタント"}</span>
      </div>
      <div className="prose prose-sm max-w-none text-zinc-800 leading-relaxed">
        {m.typing ? (
          <div className="w-full max-w-md">
            <div className="flex items-center gap-2">
              <div className="flex gap-1">
                <div className="h-2 w-2 animate-bounce rounded-full bg-blue-600 [animation-delay:-0.3s]" />
                <div className="h-2 w-2 animate-bounce rounded-full bg-blue-600 [animation-delay:-0.15s]" />
                <div className="h-2 w-2 animate-bounce rounded-full bg-blue-600" />
              </div>
              <span className="text-sm text-zinc-600">
                {m.progressText || t?.generatingAnswer || "回答を生成中…"}
              </span>
            </div>
          </div>
        ) : (
          <ChatRichText content={m.content} />
        )}
      </div>

      {/* RAG references */}
      {!m.typing && (m.type === "rag" || (m.rag_qa && m.rag_qa.length > 0)) && (
        <RagSection ragQa={m.rag_qa} t={t} navigate={navigate} />
      )}
    </div>
  );
}

function RagSection({ ragQa, t, navigate }) {
  const [isReferenceOpen, setIsReferenceOpen] = React.useState(false);

  return (
    <details
      className="mt-4"
      open={isReferenceOpen}
      onToggle={(e) => setIsReferenceOpen(e.currentTarget.open)}
    >
      <summary className="cursor-pointer py-2 text-sm text-zinc-600 hover:text-zinc-800 transition-colors list-none">
        <div className="flex items-center gap-2">
          <FileText className="h-4 w-4 text-zinc-500" />
          <span>
            {t?.similarQuestions || "参考となる関連質問"} ({ragQa?.length || 0}件)
          </span>
          {isReferenceOpen ? (
            <ChevronRight className="h-3 w-3 text-zinc-400" />
          ) : (
            <ChevronDown className="h-3 w-3 text-zinc-400" />
          )}
        </div>
      </summary>
      {ragQa && ragQa.length > 0 ? (
        <div className="divide-y divide-zinc-200">
          {ragQa.map((q, idx) => (
            <details key={idx} className="group" open={false}>
              <summary className="cursor-pointer px-4 py-3 hover:bg-zinc-50 transition-colors list-none">
                <div className="flex items-start gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 text-sm font-medium text-zinc-800 line-clamp-2">
                        <ChatRichText content={q.question} />
                      </div>
                      {q.category_id && q.question_id && (
                        <button
                          type="button"
                          aria-label="該当カテゴリを開く"
                          className="inline-flex flex-shrink-0 items-center justify-center p-1 text-zinc-500 transition-colors hover:text-blue-700"
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            navigate(`/category/${q.category_id}?id=${q.question_id}`);
                          }}
                        >
                          <ExternalLink className="h-4 w-4" />
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
                <div className="text-sm text-zinc-700 leading-relaxed">
                  <ChatRichText content={q.answer} />
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
            <p className="text-sm font-medium text-zinc-700">
              {t?.noSimilarWarning || "類似質問が見つかりませんでした"}
            </p>
          </div>
        </div>
      )}
    </details>
  );
}
