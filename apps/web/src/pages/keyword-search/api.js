import { apiFetch } from "../../api/apiClient";

export const searchKeyword = (keywords, opts) =>
  apiFetch(`/keyword/search_with_language?keywords=${encodeURIComponent(keywords)}`, {}, opts);
