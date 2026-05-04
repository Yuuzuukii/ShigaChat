const LS_MSGS_PREFIX = "chat_msgs_";

export function getThreadTitleOverrides(userId) {
  try {
    const raw = localStorage.getItem(`thread_title_overrides_${userId ?? "nouser"}`);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

export function saveThreadTitleOverrides(userId, overrides) {
  try {
    localStorage.setItem(`thread_title_overrides_${userId ?? "nouser"}`, JSON.stringify(overrides));
  } catch {}
}

export function getThreadMessages(userId, threadId) {
  try {
    return (
      JSON.parse(localStorage.getItem(`${LS_MSGS_PREFIX}${userId ?? "nouser"}_${threadId}`)) ||
      []
    );
  } catch {
    return [];
  }
}

export function saveThreadMessages(userId, threadId, messages) {
  try {
    localStorage.setItem(
      `${LS_MSGS_PREFIX}${userId ?? "nouser"}_${threadId}`,
      JSON.stringify(messages)
    );
  } catch {}
}

export function moveThreadMessages(userId, fromThreadId, toThreadId) {
  try {
    const oldKey = `${LS_MSGS_PREFIX}${userId ?? "nouser"}_${fromThreadId}`;
    const newKey = `${LS_MSGS_PREFIX}${userId ?? "nouser"}_${toThreadId}`;
    const oldVal = localStorage.getItem(oldKey);
    if (oldVal !== null) {
      localStorage.setItem(newKey, oldVal);
      localStorage.removeItem(oldKey);
    }
  } catch {}
}
