export function normalizeErrorDetail(detail) {
  if (typeof detail === "string") return detail.trim();

  if (Array.isArray(detail)) {
    return detail
      .map((item) => {
        if (typeof item === "string") return item.trim();
        if (item && typeof item === "object") {
          if (typeof item.msg === "string") return item.msg.trim();
          if (typeof item.message === "string") return item.message.trim();
        }
        return String(item ?? "").trim();
      })
      .filter(Boolean)
      .join(" ")
      .trim();
  }

  if (detail && typeof detail === "object") {
    if (typeof detail.message === "string") return detail.message.trim();
    if (typeof detail.msg === "string") return detail.msg.trim();
    try {
      return JSON.stringify(detail);
    } catch {}
  }

  return "";
}

export async function readResponseErrorMessage(response) {
  try {
    const payload = await response.clone().json();
    const fromJson = normalizeErrorDetail(
      payload?.detail ?? payload?.error ?? payload?.message ?? payload
    );
    if (fromJson) return fromJson;
  } catch {}

  try {
    const text = (await response.text()).trim();
    if (text) return text;
  } catch {}

  return "";
}
