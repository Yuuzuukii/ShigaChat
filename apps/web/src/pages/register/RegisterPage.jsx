/**
 * RegisterPage - S02 新規登録画面
 * 仕様書 W01: 入力途中の遷移警告ダイアログ実装
 */
import React, { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Eye, EyeOff, UserPlus, ArrowLeft, Loader2 } from "lucide-react";
import { translations, languageOptions } from "../../config/i18n";
import { postRegister } from "./api";
import AuthLayout from "../../features/layout/AuthLayout";
import RegisterLeaveConfirmDialog from "../../features/register/RegisterLeaveConfirmDialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../features/register/RegisterLanguageSelect";
import { FlagIcon } from "../../features/register/RegisterLanguageFlag";

export default function RegisterPage() {
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [spokenLanguage, setSpokenLanguage] = useState("");
  const [nameErrorKey, setNameErrorKey] = useState("");
  const [passwordErrorKey, setPasswordErrorKey] = useState("");
  const [spokenLanguageErrorKey, setSpokenLanguageErrorKey] = useState("");
  const [successKey, setSuccessKey] = useState("");
  const [errorKey, setErrorKey] = useState("");
  const [loading, setLoading] = useState(false);
  const successRedirectTimerRef = useRef(null);
  const t = translations.en;
  const navigate = useNavigate();

  useEffect(() => {
    return () => {
      if (successRedirectTimerRef.current) clearTimeout(successRedirectTimerRef.current);
    };
  }, []);

  // W01: 遷移警告ダイアログ
  const [showLeaveDialog, setShowLeaveDialog] = useState(false);
  const [pendingNavPath, setPendingNavPath] = useState(null);

  const hasInput = name.trim() !== "" || password.trim() !== "" || spokenLanguage !== "";

  const handleNavigate = (path) => {
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

  const handleRegister = async (e) => {
    e.preventDefault();
    setNameErrorKey("");
    setPasswordErrorKey("");
    setSpokenLanguageErrorKey("");
    setErrorKey("");
    setSuccessKey("");

    if (!name.trim()) {
      setNameErrorKey("errorEmptyNickname");
      return;
    }
    if (!password.trim()) {
      setPasswordErrorKey("errorEmptyPassword");
      return;
    }
    if (password.length < 8) {
      setPasswordErrorKey("errorPasswordTooShort");
      return;
    }
    if (!spokenLanguage) {
      setSpokenLanguageErrorKey("errorEmptyLanguage");
      return;
    }

    setLoading(true);
    try {
      const res = await postRegister(name, password, spokenLanguage);
      if (!res.ok) {
        let detail = "";
        try {
          const body = await res.json();
          detail = String(body?.detail || "");
        } catch {
          detail = "";
        }

        // Backend may return 400 or 409 for duplicate usernames.
        if (
          res.status === 409 ||
          (res.status === 400 &&
            (detail.includes("既に使用されています") || detail.toLowerCase().includes("already")))
        ) {
          setNameErrorKey("errorDuplicateUser");
          return;
        }

        throw new Error();
      }
      setSuccessKey("successRegistration");
      successRedirectTimerRef.current = setTimeout(() => navigate("/login"), 1500);
    } catch (error) {
      const isNetworkError =
        error instanceof TypeError ||
        String(error?.message || "")
          .toLowerCase()
          .includes("failed to fetch");
      setErrorKey(isNetworkError ? "errorServerConnection" : "errorRegistration");
    } finally {
      setLoading(false);
    }
  };

  // 言語ラベル一覧（サーバーは日本語ラベルで保存）
  const spokenLanguageOptions = languageOptions.map((opt) => ({
    value: opt.label,
    label: opt.label,
    code: opt.code,
  }));

  return (
    <AuthLayout>
      <div className="w-full max-w-2xl">
        <div className="group relative w-full overflow-hidden rounded-xl border border-blue-100/70 bg-white/80 shadow-xl shadow-blue-100/40 backdrop-blur-xl">
          <div className="pointer-events-none absolute -left-24 top-0 h-64 w-40 -skew-x-12 bg-gradient-to-b from-white/60 to-transparent opacity-0 transition-opacity duration-700 group-hover:opacity-100" />

          <div className="relative p-6 pb-4">
            <div className="absolute left-4 top-4">
              <button
                type="button"
                className="inline-flex h-9 items-center justify-center rounded-md px-3 text-sm font-medium text-blue-700 hover:bg-blue-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
                onClick={() => handleNavigate("/login")}
              >
                <ArrowLeft className="mr-1 h-4 w-4" />
                {t.login}
              </button>
            </div>
            <h3 className="flex flex-col items-center gap-2 text-lg font-semibold text-blue-800">
              <span className="text-2xl tracking-wide">{t.signUp}</span>
            </h3>
          </div>

          <div className="p-6 pb-6 pt-2">
            <form onSubmit={handleRegister} className="space-y-5">
              <div className="space-y-2">
                <label htmlFor="nickname" className="text-sm font-medium text-blue-900">
                  {t.nickname}
                </label>
                <input
                  id="nickname"
                  placeholder={t.nickname}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  autoComplete="username"
                  className="flex h-11 w-full rounded-xl border border-blue-200 bg-white/90 px-3 py-2 text-sm shadow-sm placeholder:text-zinc-400 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-400"
                />
                {nameErrorKey && (
                  <div
                    className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
                    role="alert"
                  >
                    {t[nameErrorKey]}
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
                    autoComplete="new-password"
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

              <div className="space-y-2">
                <label htmlFor="spokenLanguage" className="text-sm font-medium text-blue-900">
                  {t.spokenLanguage}
                </label>
                <Select value={spokenLanguage} onValueChange={setSpokenLanguage}>
                  <SelectTrigger className="h-11 w-full rounded-xl border-blue-200 bg-white/90 px-3 text-sm text-blue-900 shadow-sm">
                    <SelectValue placeholder={t.notSelected} />
                  </SelectTrigger>
                  <SelectContent>
                    {spokenLanguageOptions.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>
                        <span className="flex items-center gap-2">
                          <FlagIcon languageCode={opt.code} className="h-4 w-6" />
                          <span>{opt.label}</span>
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {spokenLanguageErrorKey && (
                  <div
                    className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
                    role="alert"
                  >
                    {t[spokenLanguageErrorKey]}
                  </div>
                )}
              </div>

              {errorKey && (
                <div
                  className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
                  role="alert"
                >
                  {t[errorKey]}
                </div>
              )}
              {successKey && (
                <div
                  className="rounded-md border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-700"
                  role="status"
                >
                  {t[successKey]}
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="group inline-flex h-11 w-full items-center justify-center rounded-xl bg-gradient-to-r from-blue-600 to-cyan-500 text-sm font-medium text-white shadow-lg ring-1 ring-blue-300 transition-all hover:-translate-y-px hover:shadow-blue-200 active:translate-y-0 disabled:pointer-events-none disabled:opacity-50"
              >
                {loading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    {t.signingUp || "Signing up..."}
                  </>
                ) : (
                  <>
                    <UserPlus className="mr-2 h-4 w-4" />
                    {t.signUp}
                  </>
                )}
              </button>

              <button
                type="button"
                className="inline-flex h-11 w-full items-center justify-center rounded-xl border border-blue-200/80 bg-white/80 text-sm font-medium text-blue-700 hover:bg-blue-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
                onClick={() => handleNavigate("/login")}
              >
                <ArrowLeft className="mr-2 h-4 w-4" />
                {t.login}
              </button>
            </form>
            <div className="mt-6 text-center text-xs text-zinc-500">
              © {new Date().getFullYear()} ShigaChat
            </div>
          </div>
        </div>
      </div>

      <RegisterLeaveConfirmDialog
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
