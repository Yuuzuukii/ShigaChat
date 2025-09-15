// Centralized login redirection helper
export function redirectToLogin(navigate) {
  try {
    const path = window.location?.pathname + window.location?.search;
    if (path && path !== "/new") {
      localStorage.setItem("redirectAfterLogin", path);
    }
  } catch {}
  navigate("/new");
}

