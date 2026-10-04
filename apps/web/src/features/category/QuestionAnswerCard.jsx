import React from "react";
import { Clock, FileText } from "lucide-react";
import CategoryAnswerText from "./CategoryAnswerText";

/** Shared behavior with the existing category and keyword result presentation. */
export default function QuestionAnswerCard({
  questionId, question, answer, updatedAt, categoryName, isOfficial,
  isExpanded, onToggle, variant = "category", t,
}) {
  const isSearchResult = variant === "search";
  const answerId = `answer-${questionId}`;
  const questionTitleId = `question-title-${questionId}`;

  const handleKeyDown = (event) => {
    if (event.target !== event.currentTarget || !["Enter", " "].includes(event.key)) return;
    event.preventDefault();
    onToggle(questionId);
  };

  return (
    <div
      id={`question-${questionId}`}
      role="button"
      tabIndex={0}
      aria-labelledby={questionTitleId}
      aria-expanded={isExpanded}
      aria-controls={isExpanded ? answerId : undefined}
      onClick={() => onToggle(questionId)}
      onKeyDown={handleKeyDown}
      className="qa-question-card min-h-[120px] cursor-pointer rounded-lg bg-zinc-50 p-6 transition-all duration-200 hover:bg-blue-50/50 hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
    >
      <div className="qa-question-heading flex items-start justify-between gap-4">
        <div className="flex min-w-0 flex-1 items-start gap-3 text-lg font-semibold text-zinc-900">
          {isSearchResult ? (
            <svg className="h-5 w-5 text-zinc-500 mt-1 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          ) : <FileText className="mt-1 h-5 w-5 flex-shrink-0 text-zinc-500" aria-hidden="true" />}
          <div id={questionTitleId} className="qa-question-text min-w-0 flex-1 leading-relaxed">
            <CategoryAnswerText content={isSearchResult ? question || t.loading : question} />
          </div>
        </div>
        {isOfficial && (
          <span className="inline-flex flex-shrink-0 items-center rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700">
            {t.official || "Official"}
          </span>
        )}
      </div>

      {isSearchResult && <div className="mt-2 text-sm text-zinc-500">{t.category}: {categoryName}</div>}

      <div className="qa-question-date mt-3 flex items-center justify-end gap-1 text-sm text-zinc-500">
        {isSearchResult ? (
          <svg className="h-4 w-4 text-zinc-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        ) : <Clock className="h-4 w-4 text-zinc-500" aria-hidden="true" />}
        <span>{t.questionDate}{new Date(isSearchResult ? (updatedAt || "").replace(" ", "T") : updatedAt).toLocaleString()}</span>
      </div>

      {isExpanded && (
        <div id={answerId} className="mt-4 rounded-md bg-blue-50/50 p-4 text-zinc-800">
          <div className="mb-2 text-sm font-semibold text-zinc-700">{t.answer}</div>
          <div className="qa-answer-text whitespace-pre-wrap break-words text-base leading-8">
            <CategoryAnswerText content={answer || t.loading} />
          </div>
        </div>
      )}
    </div>
  );
}
