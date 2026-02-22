/**
 * S04: キーワード検索画面
 * keyword.js (277行) のリファクタ版
 * - AppLayout の OutletContext から language/t を取得
 * - services/api.js の searchKeyword/addHistory を使用
 * - Admin 関連リンクを除外
 */
import React, { useState, useEffect, useRef } from "react";
import { useOutletContext } from "react-router-dom";
import { searchKeyword, addHistory as addHistoryApi } from "../services/api";
import { categoryList } from "../config/categories";
import RichText from "../components/common/RichText";
import { FileText, Clock, Search as SearchIcon } from "lucide-react";

export default function KeywordSearchPage() {
  const { language, t } = useOutletContext();

  const [keyword, setKeyword] = useState("");
  const [keywordError, setKeywordError] = useState("");
  const [results, setResults] = useState([]);
  const [visibleAnswerId, setVisibleAnswerId] = useState(null);
  const [hasSearched, setHasSearched] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const [lastSearchedTerm, setLastSearchedTerm] = useState("");
  const [mounted, setMounted] = useState(false);
  const inputRef = useRef(null);

  // 初期フォーカス
  useEffect(() => { inputRef.current?.focus(); }, []);

  // マウントアニメーション
  useEffect(() => {
    const r = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(r);
  }, []);

  // 検索結果のフェードイン
  useEffect(() => {
    if (hasSearched) {
      const timer = setTimeout(() => setShowResults(true), 50);
      return () => clearTimeout(timer);
    }
    setShowResults(false);
  }, [hasSearched]);

  const handleSearch = async () => {
    if (!keyword.trim()) {
      setKeywordError(t.keywordRequired || "キーワードを入力してください");
      return;
    }
    setKeywordError("");

    setHasSearched(true);
    setLastSearchedTerm(keyword.trim());

    try {
      const response = await searchKeyword(keyword);
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.detail || t.noResults);
      }
      const data = await response.json();
      setResults(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error("検索エラー:", error?.message || error);
      alert(t.keyworderror);
    }
  };

  const handleAddHistory = async (questionId) => {
    if (!questionId) return;
    try { await addHistoryApi(questionId); } catch {}
  };

  const toggleAnswer = (questionId) => {
    if (!questionId) return;
    setVisibleAnswerId((prev) => (prev === questionId ? null : questionId));
    handleAddHistory(questionId);
  };

  const onKeyDown = (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleSearch();
    }
  };

  return (
    <div className="min-h-full w-full bg-gradient-to-br from-blue-50 via-white to-cyan-50">
      <div className="min-h-full flex justify-center">
        <div
          className={`relative z-10 w-full mx-auto max-w-4xl px-4 py-6 text-zinc-800 transition-opacity duration-500 ${
            mounted ? "opacity-100" : "opacity-0"
          }`}
        >
          <div
            className={`transition-all duration-500 ease-out ${
              hasSearched ? "min-h-0 pt-6" : "min-h-[80vh] flex flex-col items-center justify-center"
            }`}
          >
            {/* 初期ヘッダー */}
            {!hasSearched && (
              <div className="mb-4 flex items-center justify-center gap-3 text-blue-800">
                <SearchIcon className="h-8 w-8" />
                <span className="text-3xl font-bold">{t.keyword}</span>
              </div>
            )}

            {/* 入力ボックス */}
            <div className="mb-1 w-full">
              <div className="flex flex-col sm:flex-row items-stretch gap-3">
                <input
                  ref={inputRef}
                  type="text"
                  placeholder={t.enterKeyword}
                  value={keyword}
                  onChange={(e) => {
                    setKeyword(e.target.value);
                    if (keywordError) setKeywordError("");
                  }}
                  onKeyDown={onKeyDown}
                  className="w-full rounded-lg border border-blue-200 bg-white px-4 py-3 text-zinc-800 shadow-inner focus:outline-none focus:ring-2 focus:ring-blue-300"
                />
                <button
                  onClick={handleSearch}
                  className="shrink-0 rounded-lg bg-blue-600 px-5 py-3 text-white shadow-sm transition-transform duration-200 hover:scale-105 hover:bg-blue-700"
                >
                  {t.search}
                </button>
              </div>
              {keywordError && (
                <div className="mt-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                  {keywordError}
                </div>
              )}
            </div>

            {/* 検索ワード表示 */}
            {hasSearched && (
              <div className="mb-3 w-full">
                <div className="flex flex-wrap items-center gap-2">
                  {(lastSearchedTerm || "")
                    .split(/[\s\u3000]+/)
                    .filter(Boolean)
                    .map((term, idx) => (
                      <span
                        key={`${term}-${idx}`}
                        className="inline-flex items-center rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-xs text-blue-700 sm:text-sm"
                      >
                        {term}
                      </span>
                    ))}
                </div>
              </div>
            )}

            {/* 検索結果 */}
            {hasSearched && (
              <div
                className={`mt-2 w-full transition-opacity duration-500 ${
                  showResults ? "opacity-100" : "opacity-0"
                }`}
              >
                {results.length > 0 ? (
                  <div className="space-y-4">
                    {results.map((question) => (
                      <div
                        key={question.question_id}
                        id={`question-${question.question_id}`}
                        onClick={() => toggleAnswer(question.question_id)}
                        className="cursor-pointer rounded-lg bg-zinc-50 p-4 transition-all duration-200 hover:bg-blue-50/50 hover:shadow-sm"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex items-start gap-2 text-base font-semibold text-zinc-900 min-w-0 flex-1">
                            <FileText className="h-4 w-4 text-zinc-500 mt-1 flex-shrink-0" />
                            <div className="flex-1 min-w-0">
                              <RichText content={question.question_text || t.loading} />
                            </div>
                          </div>
                          {question?.title === "official" && (
                            <span className="inline-flex items-center rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700 flex-shrink-0">
                              {t.official}
                            </span>
                          )}
                        </div>

                        <div className="mt-1 text-sm text-zinc-500">
                          {t.category}:{" "}
                          {categoryList?.find((cat) => cat.id === question.category_id)?.name?.[language] ||
                            categoryList?.find((cat) => cat.id === question.category_id)?.name?.ja ||
                            t.unknownCategory}
                        </div>

                        <div className="mt-1 flex items-center justify-end gap-1 text-xs text-zinc-500">
                          <Clock className="h-3 w-3 text-zinc-500" />
                          <span>
                            {t.questionDate}
                            {new Date((question.update_time || "").replace(" ", "T")).toLocaleString()}
                          </span>
                        </div>

                        {visibleAnswerId === question.question_id && (
                          <div className="mt-3 rounded-md bg-blue-50/50 p-3 text-zinc-800">
                            <div className="text-sm font-semibold text-zinc-700">{t.answer}</div>
                            <div className="mt-1 text-sm leading-7 whitespace-pre-wrap break-words">
                              <RichText content={question.answer_text || t.loading} />
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-center text-sm text-zinc-500">{t.noQuestions}</p>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
