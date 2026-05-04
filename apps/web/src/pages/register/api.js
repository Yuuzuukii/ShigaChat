import { apiFetch } from "../../api/apiClient";

export const postRegister = (name, password, spokenLanguage) =>
  apiFetch("/user/register", {
    method: "POST",
    body: JSON.stringify({ name, password, spoken_language: spokenLanguage }),
  });
