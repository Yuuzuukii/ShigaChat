import { apiFetch } from "../../api/apiClient";

function splitFetchOptions(opts = {}) {
  const { signal, ...apiOptions } = opts || {};
  return { signal, apiOptions };
}

export const fetchUserThreads = (opts) => {
  const { signal, apiOptions } = splitFetchOptions(opts);
  return apiFetch("/question/get_user_threads", { signal }, apiOptions);
};

export const fetchThreadMessages = (threadId, opts) => {
  const { signal, apiOptions } = splitFetchOptions(opts);
  return apiFetch(
    `/question/get_thread_messages/${encodeURIComponent(String(threadId))}`,
    { signal },
    apiOptions
  );
};

export const deleteThread = (threadId, opts) =>
  apiFetch(
    `/question/delete_thread/${encodeURIComponent(String(threadId))}`,
    { method: "DELETE" },
    opts
  );

export const postGetAnswerStream = (payload, opts) =>
  apiFetch(
    "/question/get_answer_stream",
    {
      method: "POST",
      headers: { Accept: "text/event-stream" },
      body: JSON.stringify(payload),
    },
    opts
  );

export const postAction = (payload, opts) =>
  apiFetch(
    "/action/apply",
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
    opts
  );
