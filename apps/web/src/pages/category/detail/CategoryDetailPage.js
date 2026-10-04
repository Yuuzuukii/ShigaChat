import React, { useEffect, useRef, useState } from "react";
import { useNavigate, useParams, useSearchParams, useOutletContext } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { fetchCategoryTranslation, fetchCategoryQuestions, addHistory } from "../api";
import { categoryList } from "../../../config/categories";
import { languageOptions } from "../../../config/i18n";
import { toast } from "../../../features/common/Toaster";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "../../../features/category/QaLanguageTabs";
import { FlagIcon } from "../../../components/ui/flag";
import QuestionAnswerCard from "../../../features/category/QuestionAnswerCard";
import { getCategoryIcon } from "../../../features/category/categoryPresentation";
import "../../../features/category/Responsive.css";

const supportedQaLanguageCodes = new Set(languageOptions.map((option) => option.code));
const getSupportedQaLanguage = (code) => supportedQaLanguageCodes.has(code) ? code : null;

function scrollQuestionIntoMain(questionId, scrollContainerRef) {
  const questionElement = document.getElementById(`question-${questionId}`);
  if (!questionElement) return false;

  const scrollContainer = scrollContainerRef?.current;
  if (!scrollContainer) {
    questionElement.scrollIntoView({ block: "center" });
    return true;
  }

  const containerRect = scrollContainer.getBoundingClientRect();
  const questionRect = questionElement.getBoundingClientRect();
  const targetTop = questionRect.top - containerRect.top + scrollContainer.scrollTop;
  scrollContainer.scrollTop = Math.max(0, targetTop - (containerRect.height - questionRect.height) / 2);
  return true;
}

export default function CategoryDetailPage() {
  const { categoryId } = useParams();
  const { language, t, isDrawerOpen, scrollContainerRef } = useOutletContext();
  const navigate = useNavigate();
  const backButtonLeft = isDrawerOpen ? "calc(50% + 9rem)" : "calc(50% + 1.75rem)";
  const [searchParams, setSearchParams] = useSearchParams();
  const questionId = searchParams.get("id");
  const urlQaLanguage = getSupportedQaLanguage(searchParams.get("lang"));
  const currentCategory = categoryList.find((category) => category.id === Number(categoryId));
  const CategoryIcon = getCategoryIcon(currentCategory);

  const [questions, setQuestions] = useState(null);
  const [categoryName, setCategoryName] = useState("");
  const [visibleAnswerId, setVisibleAnswerId] = useState(null);
  const [qaLanguage, setQaLanguage] = useState(urlQaLanguage || language);
  const [mounted, setMounted] = useState(false);
  const autoScrolledQuestionIdRef = useRef(null);
  const languageScrollRef = useRef(null);
  const resetScopeRef = useRef({ categoryId, language });

  useEffect(() => {
    if (resetScopeRef.current.categoryId === categoryId && resetScopeRef.current.language === language) return;
    resetScopeRef.current = { categoryId, language };
    setQaLanguage(urlQaLanguage || language);
    setQuestions(null);
    setCategoryName("");
    setVisibleAnswerId(null);
    autoScrolledQuestionIdRef.current = null;
  }, [categoryId, language, urlQaLanguage]);

  useEffect(() => {
    if (urlQaLanguage && urlQaLanguage !== qaLanguage) setQaLanguage(urlQaLanguage);
  }, [qaLanguage, urlQaLanguage]);

  useEffect(() => {
    const frameId = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(frameId);
  }, []);

  // Keep the selected language visible without moving the page vertically.
  useEffect(() => {
    const container = languageScrollRef.current;
    const selectedTab = container?.querySelector('[aria-selected="true"]');
    if (!container || !selectedTab) return;
    const containerRect = container.getBoundingClientRect();
    const tabRect = selectedTab.getBoundingClientRect();
    if (tabRect.left < containerRect.left + 8) container.scrollLeft += tabRect.left - containerRect.left - 8;
    if (tabRect.right > containerRect.right - 8) container.scrollLeft += tabRect.right - containerRect.right + 8;
  }, [qaLanguage, questions]);

  useEffect(() => {
    if (!questionId || questions === null || autoScrolledQuestionIdRef.current === questionId) return;
    const frameId = requestAnimationFrame(() => {
      if (!scrollQuestionIntoMain(questionId, scrollContainerRef)) return;
      autoScrolledQuestionIdRef.current = questionId;
      const nextSearchParams = new URLSearchParams(searchParams);
      nextSearchParams.delete("id");
      setSearchParams(nextSearchParams, { replace: true });
    });
    return () => cancelAnimationFrame(frameId);
  }, [questionId, questions, scrollContainerRef, searchParams, setSearchParams]);

  useEffect(() => {
    const controller = new AbortController();
    async function loadCategoryName() {
      try {
        const response = await fetchCategoryTranslation(categoryId, { signal: controller.signal });
        if (!response.ok) throw new Error(response.status === 404 ? "category_not_found" : "qa_fetch_failed");
        const data = await response.json();
        const rawName = data["カテゴリ名"];
        const name = typeof rawName === "object" && rawName !== null
          ? rawName.description || JSON.stringify(rawName)
          : rawName || t.categorynotfound;
        if (!controller.signal.aborted) setCategoryName(name);
      } catch (error) {
        if (controller.signal.aborted) return;
        console.error("カテゴリ詳細エラー:", error);
        toast.error(error.message === "category_not_found"
          ? t.categorynotfound || "カテゴリが見つかりません。"
          : t.qaFetchError || "Q&Aの取得に失敗しました", { duration: 4000 });
      }
    }
    loadCategoryName();
    return () => controller.abort();
  }, [categoryId, language, t]);

  useEffect(() => {
    const controller = new AbortController();
    async function loadQuestions() {
      try {
        const response = await fetchCategoryQuestions(categoryId, qaLanguage, { signal: controller.signal });
        if (!response.ok) throw new Error("qa_fetch_failed");
        const data = await response.json();
        if (controller.signal.aborted) return;
        setQuestions(Array.isArray(data.questions) ? data.questions : []);
      } catch (error) {
        if (controller.signal.aborted) return;
        console.error("カテゴリ詳細Q&Aエラー:", error);
        setQuestions([]);
        toast.error(t.qaFetchError || "Q&Aの取得に失敗しました", { duration: 4000 });
      }
    }
    loadQuestions();
    return () => controller.abort();
  }, [categoryId, language, qaLanguage, t]);

  const toggleAnswer = async (id) => {
    if (!id) return;
    setVisibleAnswerId((previous) => previous === id ? null : id);
    try { await addHistory(id); } catch {}
  };

  const handleQaLanguageChange = (nextLanguage) => {
    if (!getSupportedQaLanguage(nextLanguage)) return;
    setQaLanguage(nextLanguage);
    const nextSearchParams = new URLSearchParams(searchParams);
    nextSearchParams.set("lang", nextLanguage);
    setSearchParams(nextSearchParams);
  };

  if (questions === null) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 via-white to-cyan-50">
        <div className="text-lg text-gray-500" role="status">{t.loading}</div>
      </div>
    );
  }

  return (
    <div className="category-detail-page w-full bg-gradient-to-br from-blue-50 via-white to-cyan-50">
      <div className="flex justify-center">
        <div
          className={`relative z-10 w-full mx-auto max-w-4xl px-4 py-6 text-zinc-800 transition-opacity duration-500 ${
            mounted ? "opacity-100" : "opacity-0"
          }`}
        >
          <div className="w-full">
            <div className="mb-8 text-center">
              <div className="category-page-title flex items-center justify-center gap-3 mb-4">
                <CategoryIcon className="w-8 h-8 text-blue-800" />
                <h1 className="text-3xl font-bold text-blue-800">{categoryName}</h1>
              </div>
              <div className="w-20 h-1 bg-blue-600 mx-auto rounded-full" />
            </div>

            <Tabs value={qaLanguage} onValueChange={handleQaLanguageChange} className="mb-20 w-full">
              <div data-testid="qa-language-tabs" className="relative w-full">
                <div ref={languageScrollRef} className="qa-language-scroll relative z-20">
                  <TabsList aria-label={t.language || "Language"} className="grid-cols-9">
                    {languageOptions.map((option) => (
                      <TabsTrigger key={option.code} value={option.code} aria-label={option.label} title={option.label} className="group">
                        <FlagIcon
                          languageCode={option.code}
                          title={option.label}
                          className="h-5 w-7 opacity-80 transition-all group-hover:opacity-100 group-data-[state=active]:scale-105 group-data-[state=active]:opacity-100 sm:h-6 sm:w-9"
                        />
                      </TabsTrigger>
                    ))}
                  </TabsList>
                </div>
                <TabsContent
                  value={qaLanguage}
                  className="qa-answer-panel relative z-10 mt-0 rounded-b-[28px] border border-t-0 border-blue-100 bg-white px-5 pb-6 pt-6 shadow-[0_22px_50px_rgba(15,23,42,0.10)]"
                >
                  <div className="w-full space-y-6">
                    {questions.length > 0 ? (
                      <div className="space-y-6">
                        {questions.map((question) => (
                          <QuestionAnswerCard
                            key={question.question_id}
                            questionId={question.question_id}
                            question={question.質問}
                            answer={question.回答}
                            updatedAt={question.time}
                            isOfficial={question.title === "official"}
                            isExpanded={visibleAnswerId === question.question_id}
                            onToggle={toggleAnswer}
                            t={t}
                          />
                        ))}
                      </div>
                    ) : <p className="text-center text-sm text-zinc-500">{t.noQuestions}</p>}
                  </div>
                </TabsContent>
              </div>
            </Tabs>

            <div className="category-back-button fixed bottom-6 z-50 -translate-x-1/2" style={{ left: backButtonLeft, transition: "left 300ms ease" }}>
              <button
                type="button"
                onClick={() => navigate("/category")}
                className="px-8 py-4 bg-blue-600 text-white rounded-full shadow-lg transition-all duration-200 hover:scale-105 hover:bg-blue-700 hover:shadow-xl font-medium flex items-center gap-2"
              >
                <ArrowLeft className="w-5 h-5" />
                {t.backButton}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
