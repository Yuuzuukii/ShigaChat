import React, { useState, useEffect, useRef, useCallback } from "react";
import { useOutletContext, useSearchParams } from "react-router-dom";
import { Search as SearchIcon } from "lucide-react";
import { searchKeyword } from "./api";
import { categoryList } from "../../config/categories";
import { toast } from "../../features/common/Toaster";
import { readResponseErrorMessage } from "../../api/apiErrors";
import QuestionAnswerCard from "../../features/category/QuestionAnswerCard";
import { getCategoryName } from "../../features/category/categoryPresentation";
import "../../features/category/Responsive.css";

function isNoResultError(status, message) {
  return status === 404 || /該当する.*見つかりません|no matching|not found|見つかりません/i.test(String(message || ""));
}

export default function KeywordSearchPage() {
  const { language, t } = useOutletContext();
  const [searchParams, setSearchParams] = useSearchParams();
  const searchParamString = searchParams.toString();
  const [keyword, setKeyword] = useState(() => searchParams.get("q") || "");
  const [keywordError, setKeywordError] = useState("");
  const [results, setResults] = useState([]);
  const [visibleAnswerId, setVisibleAnswerId] = useState(null);
  const [hasSearched, setHasSearched] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [showNoResults, setShowNoResults] = useState(false);
  const [searchFailure, setSearchFailure] = useState("");
  const [lastSearchedTerm, setLastSearchedTerm] = useState("");
  const [mounted, setMounted] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const inputRef = useRef(null);
  const searchRequestIdRef = useRef(0);

  useEffect(() => {
    if (window.matchMedia?.("(min-width: 1024px)")?.matches) inputRef.current?.focus();
    const frameId = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(frameId);
  }, []);

  useEffect(() => {
    if (!hasSearched) {
      setShowResults(false);
      return;
    }
    const timer = setTimeout(() => setShowResults(true), 50);
    return () => clearTimeout(timer);
  }, [hasSearched]);

  const executeSearch = useCallback(async (trimmedKeyword) => {
    const requestId = ++searchRequestIdRef.current;
    const isCurrentRequest = () => requestId === searchRequestIdRef.current;
    setKeywordError("");
    setSearchFailure("");
    setShowNoResults(false);
    setHasSearched(true);
    setIsSearching(true);
    setResults([]);
    setVisibleAnswerId(null);
    setLastSearchedTerm(trimmedKeyword);

    try {
      const normalizedKeyword = language === "en" ? trimmedKeyword.toLowerCase() : trimmedKeyword;
      const response = await searchKeyword(normalizedKeyword);
      if (!isCurrentRequest()) return;
      if (!response.ok) {
        const detail = await readResponseErrorMessage(response);
        if (!isCurrentRequest()) return;
        if (isNoResultError(response.status, detail)) {
          setShowNoResults(true);
          return;
        }
        throw new Error(detail || t.keyworderror || "検索に失敗しました");
      }
      const data = await response.json();
      if (!isCurrentRequest()) return;
      const nextResults = Array.isArray(data) ? data : [];
      setResults(nextResults);
      setShowNoResults(nextResults.length === 0);
    } catch (error) {
      if (!isCurrentRequest()) return;
      console.error("検索エラー:", error?.message || error);
      const message = t.keyworderror || "検索に失敗しました";
      setSearchFailure(message);
      toast.error(message, { duration: 4000 });
    } finally {
      if (isCurrentRequest()) setIsSearching(false);
    }
  }, [language, t]);

  useEffect(() => {
    const query = new URLSearchParams(searchParamString).get("q") || "";
    setKeyword(query);
    if (query.trim()) {
      executeSearch(query.trim());
    } else {
      setResults([]);
      setHasSearched(false);
      setIsSearching(false);
      setShowNoResults(false);
      setSearchFailure("");
    }
    return () => { searchRequestIdRef.current += 1; };
  }, [searchParamString, executeSearch]);

  const handleSearch = (event) => {
    event.preventDefault();
    const trimmedKeyword = keyword.trim();
    if (!trimmedKeyword) {
      setKeywordError(t.keywordRequired || "キーワードを入力してください");
      inputRef.current?.focus();
      return;
    }
    if (searchParams.get("q") === trimmedKeyword) {
      executeSearch(trimmedKeyword);
    } else {
      const nextSearchParams = new URLSearchParams(searchParams);
      nextSearchParams.set("q", trimmedKeyword);
      setSearchParams(nextSearchParams);
    }
  };

  const toggleAnswer = (questionId) => {
    setVisibleAnswerId((previous) => previous === questionId ? null : questionId);
  };

  return (
    <div className="keyword-search-page min-h-full w-full bg-gradient-to-br from-blue-50 via-white to-cyan-50">
      <div className="min-h-full flex justify-center">
        <div
          className={`relative z-10 w-full mx-auto max-w-4xl px-4 py-6 text-zinc-800 transition-opacity duration-500 ${
            mounted ? "opacity-100" : "opacity-0"
          }`}
        >
          <div className={`transition-all duration-500 ease-out ${hasSearched ? "min-h-0 pt-6" : "min-h-[80vh] flex flex-col items-center justify-center"}`}>
            {!hasSearched && (
              <div className="mb-4 flex items-center justify-center gap-3 text-blue-800">
                <SearchIcon className="h-8 w-8" />
                <span className="keyword-page-title text-3xl font-bold">{t.keyword}</span>
              </div>
            )}

            <form className="mb-1 w-full" role="search" onSubmit={handleSearch}>
              <label htmlFor="keyword-search-input" className="sr-only">{t.enterKeyword}</label>
              <div className="flex flex-col sm:flex-row items-stretch gap-3">
                <input
                  ref={inputRef}
                  id="keyword-search-input"
                  type="text"
                  role="searchbox"
                  inputMode="search"
                  enterKeyHint="search"
                  placeholder={t.enterKeyword}
                  value={keyword}
                  aria-invalid={Boolean(keywordError)}
                  aria-describedby={keywordError ? "keyword-search-error" : undefined}
                  onChange={(event) => { setKeyword(event.target.value); setKeywordError(""); }}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && (event.nativeEvent.isComposing || event.keyCode === 229)) event.preventDefault();
                  }}
                  className="keyword-search-input w-full rounded-lg border border-blue-200 bg-white px-4 py-3 text-zinc-800 shadow-inner focus:outline-none focus:ring-2 focus:ring-blue-300"
                />
                <button type="submit" className="shrink-0 rounded-lg bg-blue-600 px-5 py-3 text-white shadow-sm transition-transform duration-200 hover:scale-105 hover:bg-blue-700">
                  {t.search}
                </button>
              </div>
              {keywordError && <div id="keyword-search-error" className="mt-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">{keywordError}</div>}
            </form>

            {hasSearched && (
              <div className="mb-3 w-full">
                <div className="flex flex-wrap items-center gap-2">
                  {lastSearchedTerm.split(/[\s\u3000]+/).filter(Boolean).map((term, index) => (
                    <span key={`${term}-${index}`} className="keyword-search-term inline-flex items-center rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-xs text-blue-700 sm:text-sm">{term}</span>
                  ))}
                </div>
              </div>
            )}

            {hasSearched && (
              <div className={`mt-2 w-full transition-opacity duration-500 ${showResults ? "opacity-100" : "opacity-0"}`} aria-busy={isSearching}>
                {isSearching ? (
                  <p className="text-center text-sm text-zinc-500" role="status">{t.loading}</p>
                ) : results.length > 0 ? (
                  <div className="space-y-6">
                    {results.map((question) => (
                      <QuestionAnswerCard
                        key={question.question_id}
                        questionId={question.question_id}
                        question={question.question_text}
                        answer={question.answer_text}
                        updatedAt={question.update_time}
                        categoryName={getCategoryName(categoryList.find((category) => category.id === Number(question.category_id)), language, t.unknownCategory)}
                        isOfficial={question.title === "official"}
                        isExpanded={visibleAnswerId === question.question_id}
                        onToggle={toggleAnswer}
                        variant="search"
                        t={t}
                      />
                    ))}
                  </div>
                ) : showNoResults ? (
                  <p className="text-center text-sm text-zinc-500" role="status">{t.noResults}</p>
                ) : searchFailure ? (
                  <p className="mt-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">{searchFailure}</p>
                ) : null}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
