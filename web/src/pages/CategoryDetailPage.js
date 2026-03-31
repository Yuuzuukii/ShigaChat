/**
 * S06: カテゴリ詳細画面
 * - AppLayout の OutletContext から language/t を取得
 * - services/api.js を使用
 * - Admin 関連を除外
 */
import React, { useEffect, useState } from "react";
import { useParams, useNavigate, useSearchParams, useOutletContext } from "react-router-dom";
import {
  fetchCategoryTranslation,
  fetchCategoryQuestions,
  addHistory as addHistoryApi,
} from "../services/api";
import { categoryList } from "../config/categories";
import RichText from "../components/common/RichText";
import { toast } from "../lib/utils";
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
} from "lucide-react";

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

export default function CategoryDetailPage() {
  const { categoryId } = useParams();
  const { language, t } = useOutletContext();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const questionId = searchParams.get("id");

  const [questions, setQuestions] = useState(null);
  const [categoryName, setCategoryName] = useState("");
  const [visibleAnswerId, setVisibleAnswerId] = useState(null);
  const [mounted, setMounted] = useState(false);

  // マウントアニメーション
  useEffect(() => {
    const r = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(r);
  }, []);

  // スクロール to question
  useEffect(() => {
    if (!questionId) return;
    const timeout = setTimeout(() => {
      const el = document.getElementById(`question-${questionId}`);
      if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 300);
    return () => clearTimeout(timeout);
  }, [questionId]);

  // データ取得
  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        // カテゴリ名取得
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

        // Q&A取得
        const qaRes = await fetchCategoryQuestions(categoryId, language);
        if (!qaRes.ok) throw new Error(ERROR_QA_FETCH_FAILED);
        const qaData = await qaRes.json();
        if (!cancelled) setQuestions(qaData.questions || []);
      } catch (error) {
        console.error("カテゴリ詳細エラー:", error);
        if (!cancelled) {
          setQuestions([]);
          const code = String(error?.message || "").trim();
          const message =
            code === ERROR_CATEGORY_NOT_FOUND
              ? t?.categorynotfound || "カテゴリが見つかりません。"
              : t?.qaFetchError || "Q&Aの取得に失敗しました";
          toast.error(message, { duration: 4000 });
        }
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [categoryId, language, t]);

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

  // ローディング表示
  if (questions === null) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 via-white to-cyan-50">
        <div className="text-lg text-gray-500">{t.loading}</div>
      </div>
    );
  }

  const currentCategory = categoryList.find((cat) => cat.id === parseInt(categoryId));
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

            {/* 質問リスト */}
            <div className="w-full space-y-6 mb-20">
              {questions.length > 0 ? (
                <div className="space-y-6">
                  {questions.map((question) => (
                    <div
                      key={question.question_id}
                      id={`question-${question.question_id}`}
                      onClick={() => toggleAnswer(question.question_id)}
                      className="cursor-pointer rounded-lg bg-zinc-50 p-6 transition-all duration-200 hover:bg-blue-50/50 hover:shadow-sm min-h-[120px]"
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex items-start gap-3 text-lg font-semibold text-zinc-900 min-w-0 flex-1">
                          <svg
                            className="h-5 w-5 text-zinc-500 mt-1 flex-shrink-0"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                            />
                          </svg>
                          <div className="flex-1 min-w-0 leading-relaxed">
                            <RichText content={question.質問} />
                          </div>
                        </div>
                        {question?.title === "official" && (
                          <span className="inline-flex items-center rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700 flex-shrink-0">
                            {t.official}
                          </span>
                        )}
                      </div>

                      <div className="mt-3 flex items-center justify-end gap-1 text-sm text-zinc-500">
                        <svg
                          className="h-4 w-4 text-zinc-500"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                          />
                        </svg>
                        <span>
                          {t.questionDate}
                          {new Date(question.time).toLocaleString()}
                        </span>
                      </div>

                      {visibleAnswerId === question.question_id && (
                        <div className="mt-4 rounded-md bg-blue-50/50 p-4 text-zinc-800">
                          <div className="text-sm font-semibold text-zinc-700 mb-2">{t.answer}</div>
                          <div className="text-base leading-8 whitespace-pre-wrap break-words">
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

            {/* 戻るボタン */}
            <div className="fixed bottom-6 left-1/2 transform -translate-x-1/2 z-50">
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
