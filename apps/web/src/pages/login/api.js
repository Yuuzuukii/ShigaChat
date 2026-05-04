import { apiFetch } from "../../api/apiClient";

export const postLogin = (username, password) =>
  apiFetch("/user/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ username, password }).toString(),
  });

export const fetchCurrentUser = (opts) => apiFetch("/user/current_user", {}, opts);
