import { apiFetch } from "../../api/apiClient";

function splitFetchOptions(opts = {}) {
  const { signal, ...apiOptions } = opts || {};
  return { signal, apiOptions };
}

export const fetchCategoryTranslation = (categoryId, opts) =>
  apiFetch(
    `/category/category_translation/${categoryId}`,
    { signal: splitFetchOptions(opts).signal },
    splitFetchOptions(opts).apiOptions
  );

export const fetchCategoryQuestions = (categoryId, lang, opts) =>
  apiFetch(
    `/category/category/${categoryId}?lang=${lang}`,
    { signal: splitFetchOptions(opts).signal },
    splitFetchOptions(opts).apiOptions
  );

export const fetchCategoryByQuestion = (questionId, opts) =>
  apiFetch(
    `/category/get_category_by_question?question_id=${questionId}`,
    { signal: splitFetchOptions(opts).signal },
    splitFetchOptions(opts).apiOptions
  );

export const addHistory = (questionId, opts) =>
  apiFetch(
    "/history/add_history",
    {
      method: "POST",
      body: JSON.stringify({ question_id: questionId }),
    },
    opts
  );
