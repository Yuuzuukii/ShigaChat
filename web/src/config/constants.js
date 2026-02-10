// 環境変数ベースの設定値のみ
export const BASE_PATH = process.env.REACT_APP_BASE_PATH || "/";
export const API_BASE_URL = process.env.REACT_APP_API_URL || "http://localhost:8000";
export const MAINTENANCE_MODE = process.env.REACT_APP_MAINTENANCE_MODE === "true";

// 後方互換: 旧importパスのエイリアス（移行後に削除予定）
export { translations, languageLabelToCode, languageCodeToLabel, languageOptions } from "./i18n";
export { categoryList, categoryColors } from "./categories";
