export const decodeToken = (token) => {
  try {
    if (!token || typeof token !== "string" || !token.includes(".")) {
      throw new Error("トークン形式が無効です");
    }

    const base64Url = token.split(".")[1];
    const base64 = base64Url.replace(/-/g, "+").replace(/_/g, "/");
    const jsonPayload = decodeURIComponent(
      atob(base64)
        .split("")
        .map((c) => `%${c.charCodeAt(0).toString(16).padStart(2, "0")}`)
        .join("")
    );
    return JSON.parse(jsonPayload);
  } catch (error) {
    console.error("トークンのデコードに失敗しました:", error.message);
    return null;
  }
};
