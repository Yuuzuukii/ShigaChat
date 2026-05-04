/**
 * LoginPage - S01 ログイン画面
 * 仕様書 W01: 入力途中の遷移警告ダイアログ実装
 */
import React, { useState, useEffect, useContext } from "react";
import { useNavigate } from "react-router-dom";
import { Eye, EyeOff, LogIn, Loader2 } from "lucide-react";
import { UserContext } from "../../contexts/UserContext";
import { translations } from "../../config/i18n";
import { postLogin, fetchCurrentUser } from "./api";
import AuthLayout from "../../features/layout/AuthLayout";
import LoginLeaveConfirmDialog from "../../features/login/LoginLeaveConfirmDialog";

export default function LoginPage() {
  const [nickname, setNickname] = useState("");
  const [password, setPassword] = useState("");
  const [nicknameErrorKey, setNicknameErrorKey] = useState("");
  const [passwordErrorKey, setPasswordErrorKey] = useState("");
  const [errorMessageKey, setErrorMessageKey] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const { user, setToken, setUser } = useContext(UserContext);
  const t = translations.en;
  const navigate = useNavigate();

  // W01: 遷移警告ダイアログ
  const [showLeaveDialog, setShowLeaveDialog] = useState(false);
  const [pendingNavPath, setPendingNavPath] = useState(null);

  const hasInput = nickname.trim() !== "" || password.trim() !== "";

  const handleNavigate = (path) => {
    // Login -> Register should not prompt; move immediately.
    if (path === "/register") {
      navigate(path);
      return;
    }
    if (hasInput) {
      setPendingNavPath(path);
      setShowLeaveDialog(true);
    } else {
      navigate(path);
    }
  };

  const confirmLeave = () => {
    setShowLeaveDialog(false);
    if (pendingNavPath) navigate(pendingNavPath);
  };

  // ログイン済みならリダイレクト
  useEffect(() => {
    if (user) {
      try {
        localStorage.removeItem("redirectAfterLogin");
      } catch {}
      navigate("/home", { replace: true });
    }
  }, [user, navigate]);

  const handleLogin = async () => {
    setNicknameErrorKey("");
    setPasswordErrorKey("");
    setErrorMessageKey("");
    if (!nickname.trim()) {
      setNicknameErrorKey("errorEmptyNickname");
      return;
    }
    if (!password.trim()) {
      setPasswordErrorKey("errorEmptyPassword");
      return;
    }
    if (!/^[A-Za-z0-9]{8,}$/.test(password)) {
      setPasswordErrorKey("errorPasswordTooShort");
      return;
    }

    setLoading(true);
    try {
      const loginRes = await postLogin(nickname, password);
      if (!loginRes.ok) {
        if (loginRes.status === 401 || loginRes.status === 404) {
          // Show credential errors under the password field.
          setPasswordErrorKey("errorInvalidLogin");
        } else {
          setErrorMessageKey("errorServerConnection");
        }
        return;
      }
      const { access_token } = await loginRes.json();
      localStorage.setItem("token", access_token);
      setToken(access_token);

      const userRes = await fetchCurrentUser();
      if (!userRes.ok) throw new Error();
      const userData = await userRes.json();
      const mapped = {
        id: userData.id,
        nickname: userData.name,
        spokenLanguage: userData.spoken_language,
      };
      setUser(mapped);
      try {
        localStorage.setItem("user", JSON.stringify(mapped));
      } catch {}

      try {
        localStorage.removeItem("redirectAfterLogin");
      } catch {}
      navigate("/home", { replace: true });
    } catch (error) {
      setErrorMessageKey("errorServerConnection");
      console.error("ログインエラー:", error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout>
      <div className="w-full max-w-2xl">
        <div className="group relative w-full overflow-hidden rounded-xl border border-blue-100/70 bg-white/70 shadow-xl shadow-blue-100/40 backdrop-blur-xl">
          <div className="pointer-events-none absolute -left-24 top-0 h-64 w-40 -skew-x-12 bg-gradient-to-b from-white/60 to-transparent opacity-0 transition-opacity duration-700 group-hover:opacity-100" />

          <div className="relative p-6 pb-4">
            <h3 className="flex flex-col items-center gap-2 text-lg font-semibold text-blue-800">
              <img
                src={`${process.env.PUBLIC_URL}/icon_192.png`}
                alt="ShigaChat"
                className="h-10 w-10 rounded-xl shadow-sm"
              />
              <span className="text-2xl tracking-wide">ShigaChat</span>
            </h3>
          </div>

          <div className="p-6 pb-6 pt-2">
            <form onSubmit={(e) => e.preventDefault()} className="space-y-5">
              <div className="space-y-2">
                <label htmlFor="nickname" className="text-sm font-medium text-blue-900">
                  {t.nickname}
                </label>
                <input
                  id="nickname"
                  placeholder={t.nickname}
                  value={nickname}
                  onChange={(e) => setNickname(e.target.value)}
                  autoComplete="username"
                  className="flex h-11 w-full rounded-xl border border-blue-200 bg-white/90 px-3 py-2 text-sm shadow-sm placeholder:text-zinc-400 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-400"
                />
                {nicknameErrorKey && (
                  <div
                    className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
                    role="alert"
                  >
                    {t[nicknameErrorKey]}
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <label htmlFor="password" className="text-sm font-medium text-blue-900">
                  {t.password}
                </label>
                <div className="relative">
                  <input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    placeholder={t.password}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete="current-password"
                    className="flex h-11 w-full rounded-xl border border-blue-200 bg-white/90 px-3 py-2 pr-10 text-sm shadow-sm placeholder:text-zinc-400 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-400"
                  />
                  <button
                    type="button"
                    className="absolute right-1.5 top-1.5 inline-flex h-8 w-8 items-center justify-center rounded-md text-blue-700 hover:bg-blue-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
                    onClick={() => setShowPassword((v) => !v)}
                  >
                    {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                  </button>
                </div>
                {passwordErrorKey && (
                  <div
                    className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
                    role="alert"
                  >
                    {t[passwordErrorKey]}
                  </div>
                )}
              </div>

              {errorMessageKey && (
                <div
                  className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
                  role="alert"
                >
                  {t[errorMessageKey]}
                </div>
              )}

              <button
                type="button"
                onClick={handleLogin}
                disabled={loading}
                className="group inline-flex h-11 w-full items-center justify-center rounded-xl bg-gradient-to-r from-blue-600 to-cyan-500 text-sm font-medium text-white shadow-lg ring-1 ring-blue-300 transition-all hover:-translate-y-px hover:shadow-blue-200 active:translate-y-0 disabled:pointer-events-none disabled:opacity-50"
              >
                {loading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    {t.signingIn || "Signing in..."}
                  </>
                ) : (
                  <>
                    <LogIn className="mr-2 h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                    {t.login}
                  </>
                )}
              </button>

              <button
                type="button"
                className="inline-flex h-11 w-full items-center justify-center rounded-xl border border-blue-200/80 bg-white/80 text-sm font-medium text-blue-700 hover:bg-blue-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
                onClick={() => handleNavigate("/register")}
              >
                {t.signUp}
              </button>
            </form>
            <div className="mt-6 text-center text-xs text-zinc-500">
              © {new Date().getFullYear()} ShigaChat
            </div>
          </div>
        </div>
      </div>

      {/* W01: 遷移警告ダイアログ */}
      <LoginLeaveConfirmDialog
        open={showLeaveDialog}
        title={t.confirmLeave}
        message={t.confirmLeave}
        confirmLabel="OK"
        cancelLabel={t.cancel}
        onConfirm={confirmLeave}
        onCancel={() => setShowLeaveDialog(false)}
      />
    </AuthLayout>
  );
}
