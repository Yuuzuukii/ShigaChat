/**
 * S06: カテゴリ詳細画面
 * - AppLayout の OutletContext から language/t を取得
 * - services/api.js を使用
 * - Admin 関連を除外
 */
import React, { useEffect, useRef, useState } from "react";
import { useParams, useNavigate, useSearchParams, useOutletContext } from "react-router-dom";
import {
  fetchCategoryTranslation,
  fetchCategoryQuestions,
  addHistory as addHistoryApi,
} from "../api";
import { categoryList } from "../../../config/categories";
import RichText from "../../../components/common/RichText";
import { toast } from "../../../features/common/toast";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "../../../components/ui/tabs";
import { FlagIcon } from "../../../components/ui/flag";
import {
  IdCard,
  HeartHandshake,
  Stethoscope,
  PiggyBank,
  Briefcase,
  GraduationCap,
  Heart,
  Baby,
  Home,
  Receipt,
  HelpingHand,
  Siren,
  CloudLightning,
  Tag,
  ArrowLeft,
  Clock,
  FileText,
} from "lucide-react";
import { languageOptions } from "../../../config/i18n";

const categoryIcons = {
  "category-zairyu": IdCard,
  "category-seikatsu": HeartHandshake,
  "category-iryo": Stethoscope,
  "category-nenkin": PiggyBank,
  "category-roudou": Briefcase,
  "category-kyouiku": GraduationCap,
  "category-kekkon": Heart,
  "category-shussan": Baby,
  "category-jutaku": Home,
  "category-zeikin": Receipt,
  "category-fukushi": HelpingHand,
  "category-jiken": Siren,
  "category-saigai": CloudLightning,
  "category-sonota": Tag,
};

const ERROR_CATEGORY_NOT_FOUND = "category_not_found";
const ERROR_QA_FETCH_FAILED = "qa_fetch_failed";
const QA_LANGUAGE_PARAM = "lang";
const supportedQaLanguageCodes = new Set(languageOptions.map((option) => option.code));

function getSupportedQaLanguage(code) {
  return supportedQaLanguageCodes.has(code) ? code : null;
}

function scrollQuestionIntoMain(questionId, scrollContainerRef) {
  const questionEl = document.getElementById(`question-${questionId}`);
  if (!questionEl) return false;

  const scrollContainer = scrollContainerRef?.current;
  if (!scrollContainer) {
    questionEl.scrollIntoView({ block: "center" });
    return true;
  }

  const containerRect = scrollContainer.getBoundingClientRect();
  const questionRect = questionEl.getBoundingClientRect();
  const currentScrollTop = scrollContainer.scrollTop;
  const targetTop = questionRect.top - containerRect.top + currentScrollTop;
  const centeredScrollTop = Math.max(
    0,
    targetTop - (containerRect.height - questionRect.height) / 2
  );

  scrollContainer.scrollTop = centeredScrollTop;
  return true;
}

export default function CategoryDetailPage() {
  const { categoryId } = useParams();
  const { language, t, isDrawerOpen, scrollContainerRef } = useOutletContext();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const questionId = searchParams.get("id");
  const urlQaLanguage = getSupportedQaLanguage(searchParams.get(QA_LANGUAGE_PARAM));
  const autoScrolledQuestionIdRef = useRef(null);
  const backButtonLeft = isDrawerOpen ? "calc(50% + 9rem)" : "calc(50% + 1.75rem)";

  const [questions, setQuestions] = useState(null);
  const [categoryName, setCategoryName] = useState("");
  const [visibleAnswerId, setVisibleAnswerId] = useState(null);
  const [mounted, setMounted] = useState(false);
  const [qaLanguage, setQaLanguage] = useState(urlQaLanguage || language);
  const hasLoadedQuestionsRef = useRef(false);
  const resetScopeRef = useRef({ categoryId, language });

  useEffect(() => {
    const didScopeChange =
      resetScopeRef.current.categoryId !== categoryId ||
      resetScopeRef.current.language !== language;

    if (!didScopeChange) return;

    resetScopeRef.current = { categoryId, language };
    setQaLanguage(urlQaLanguage || language);
    setQuestions(null);
    setCategoryName("");
    setVisibleAnswerId(null);
    hasLoadedQuestionsRef.current = false;
    autoScrolledQuestionIdRef.current = null;
  }, [categoryId, language, urlQaLanguage]);

  useEffect(() => {
    if (!urlQaLanguage || urlQaLanguage === qaLanguage) return;
    setQaLanguage(urlQaLanguage);
  }, [qaLanguage, urlQaLanguage]);

  // マウントアニメーション
  useEffect(() => {
    const r = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(r);
  }, []);

  // スクロール to question
  useEffect(() => {
    if (!questionId || questions === null) return;
    if (autoScrolledQuestionIdRef.current === questionId) return;

    const frameId = requestAnimationFrame(() => {
      const didScroll = scrollQuestionIntoMain(questionId, scrollContainerRef);
      if (!didScroll) return;

      autoScrolledQuestionIdRef.current = questionId;

      const nextSearchParams = new URLSearchParams(searchParams);
      nextSearchParams.delete("id");
      setSearchParams(nextSearchParams, { replace: true });
    });

    return () => cancelAnimationFrame(frameId);
  }, [questionId, questions, scrollContainerRef, searchParams, setSearchParams]);

  // カテゴリ名取得
  useEffect(() => {
    let cancelled = false;

    async function loadCategoryName() {
      try {
        const catRes = await fetchCategoryTranslation(categoryId);
        if (!catRes.ok) {
          if (catRes.status === 404) throw new Error(ERROR_CATEGORY_NOT_FOUND);
          throw new Error(ERROR_QA_FETCH_FAILED);
        }
        const catData = await catRes.json();
        const rawName = catData["カテゴリ名"];
        const nameText =
          typeof rawName === "object" && rawName !== null
            ? rawName.description || JSON.stringify(rawName)
            : rawName || t.categorynotfound;
        if (!cancelled) setCategoryName(nameText);
      } catch (error) {
        console.error("カテゴリ詳細エラー:", error);
        if (!cancelled) {
          const code = String(error?.message || "").trim();
          const message =
            code === ERROR_CATEGORY_NOT_FOUND
              ? t?.categorynotfound || "カテゴリが見つかりません。"
              : t?.qaFetchError || "Q&Aの取得に失敗しました";
          toast.error(message, { duration: 4000 });
        }
      }
    }

    loadCategoryName();
    return () => {
      cancelled = true;
    };
  }, [categoryId, language, t]);

  // Q&A取得
  useEffect(() => {
    let cancelled = false;

    async function loadQuestions() {
      try {
        const qaRes = await fetchCategoryQuestions(categoryId, qaLanguage);
        if (!qaRes.ok) throw new Error(ERROR_QA_FETCH_FAILED);

        const qaData = await qaRes.json();
        if (!cancelled) {
          setQuestions(qaData.questions || []);
          hasLoadedQuestionsRef.current = true;
        }
      } catch (error) {
        console.error("カテゴリ詳細Q&Aエラー:", error);
        if (!cancelled) {
          setQuestions([]);
          hasLoadedQuestionsRef.current = true;
          toast.error(t?.qaFetchError || "Q&Aの取得に失敗しました", { duration: 4000 });
        }
      }
    }

    loadQuestions();
    return () => {
      cancelled = true;
    };
  }, [categoryId, language, qaLanguage, t]);

  const handleAddHistory = async (qId) => {
    if (!qId) return;
    try {
      await addHistoryApi(qId);
    } catch {}
  };

  const toggleAnswer = (qId) => {
    if (!qId) return;
    setVisibleAnswerId((prev) => (prev === qId ? null : qId));
    handleAddHistory(qId);
  };

  const handleQaLanguageChange = (nextLanguage) => {
    if (!getSupportedQaLanguage(nextLanguage)) return;

    setQaLanguage(nextLanguage);
    const nextSearchParams = new URLSearchParams(searchParams);
    nextSearchParams.set(QA_LANGUAGE_PARAM, nextLanguage);
    setSearchParams(nextSearchParams);
  };

  // ローディング表示
  if (questions === null) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 via-white to-cyan-50">
        <div className="text-lg text-gray-500">{t.loading}</div>
      </div>
    );
  }

  const currentCategory = categoryList.find((cat) => cat.id === Number.parseInt(categoryId, 10));
  const CategoryIcon = currentCategory ? categoryIcons[currentCategory.className] || Tag : Tag;

  return (
    <div className="w-full bg-gradient-to-br from-blue-50 via-white to-cyan-50">
      <div className="flex justify-center">
        <div
          className={`relative z-10 w-full mx-auto max-w-4xl px-4 py-6 text-zinc-800 transition-opacity duration-500 ${
            mounted ? "opacity-100" : "opacity-0"
          }`}
        >
          <div className="w-full">
            {/* カテゴリタイトル */}
            <div className="mb-8 text-center">
              <div className="flex items-center justify-center gap-3 mb-4">
                <CategoryIcon className="w-8 h-8 text-blue-800" />
                <h1 className="text-3xl font-bold text-blue-800">{categoryName}</h1>
              </div>
              <div className="w-20 h-1 bg-blue-600 mx-auto rounded-full" />
            </div>

            <Tabs
              value={qaLanguage}
              onValueChange={handleQaLanguageChange}
              className="mb-20 w-full"
            >
              <div data-testid="qa-language-tabs" className="relative w-full">
                <div className="relative z-20">
                  <TabsList aria-label={t.language || "Language"} className="grid-cols-9">
                    {languageOptions.map((option) => (
                      <TabsTrigger
                        key={option.code}
                        value={option.code}
                        aria-label={option.label}
                        title={option.label}
                        className="group"
                      >
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
                  className="relative z-10 mt-0 rounded-b-[28px] border border-t-0 border-blue-100 bg-white px-5 pb-6 pt-6 shadow-[0_22px_50px_rgba(15,23,42,0.10)]"
                >
                  {/* 質問リスト */}
                  <div className="w-full space-y-6">
                    {questions.length > 0 ? (
                      <div className="space-y-6">
                        {questions.map((question) => (
                          <div
                            key={question.question_id}
                            id={`question-${question.question_id}`}
                            onClick={() => toggleAnswer(question.question_id)}
                            className="min-h-[120px] cursor-pointer rounded-lg bg-zinc-50 p-6 transition-all duration-200 hover:bg-blue-50/50 hover:shadow-sm"
                          >
                            <div className="flex items-start justify-between gap-4">
                              <div className="flex min-w-0 flex-1 items-start gap-3 text-lg font-semibold text-zinc-900">
                                <FileText className="mt-1 h-5 w-5 flex-shrink-0 text-zinc-500" />
                                <div className="min-w-0 flex-1 leading-relaxed">
                                  <RichText content={question.質問} />
                                </div>
                              </div>
                              {question?.title === "official" && (
                                <span className="inline-flex flex-shrink-0 items-center rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700">
                                  {t.official || "Official"}
                                </span>
                              )}
                            </div>

                            <div className="mt-3 flex items-center justify-end gap-1 text-sm text-zinc-500">
                              <Clock className="h-4 w-4 text-zinc-500" />
                              <span>
                                {t.questionDate}
                                {new Date(question.time).toLocaleString()}
                              </span>
                            </div>

                            {visibleAnswerId === question.question_id && (
                              <div className="mt-4 rounded-md bg-blue-50/50 p-4 text-zinc-800">
                                <div className="mb-2 text-sm font-semibold text-zinc-700">
                                  {t.answer}
                                </div>
                                <div className="whitespace-pre-wrap break-words text-base leading-8">
                                  <RichText content={question.回答 || t.loading} />
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
                </TabsContent>
              </div>
            </Tabs>

            {/* 戻るボタン */}
            <div
              className="fixed bottom-6 z-50 -translate-x-1/2"
              style={{ left: backButtonLeft, transition: "left 300ms ease" }}
            >
              <button
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
