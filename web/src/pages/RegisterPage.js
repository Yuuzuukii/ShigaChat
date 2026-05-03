/**
 * RegisterPage - S02 新規登録画面
 * 仕様書 W01: 入力途中の遷移警告ダイアログ実装
 */
import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Eye, EyeOff, UserPlus, ArrowLeft, Loader2 } from "lucide-react";
import { translations, languageOptions } from "../config/i18n";
import { postRegister } from "../services/api";
import AuthLayout from "../components/layout/AuthLayout";
import ConfirmDialog from "../components/common/ConfirmDialog";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../components/ui/select";

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
  const t = translations.en;
  const navigate = useNavigate();

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
      setTimeout(() => navigate("/login"), 1500);
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
  }));

  return (
    <AuthLayout>
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="w-full max-w-2xl"
      >
        <Card className="group relative w-full overflow-hidden border border-blue-100/70 bg-white/80 shadow-xl shadow-blue-100/40 backdrop-blur-xl">
          <div className="pointer-events-none absolute -left-24 top-0 h-64 w-40 -skew-x-12 bg-gradient-to-b from-white/60 to-transparent opacity-0 transition-opacity duration-700 group-hover:opacity-100" />

          <CardHeader className="pb-4 relative">
            <div className="absolute left-4 top-4">
              <Button
                variant="ghost"
                size="sm"
                className="text-blue-700"
                onClick={() => handleNavigate("/login")}
              >
                <ArrowLeft className="mr-1 h-4 w-4" />
                {t.login}
              </Button>
            </div>
            <CardTitle className="flex flex-col items-center gap-2 text-blue-800">
              <span className="text-2xl tracking-wide">{t.signUp}</span>
            </CardTitle>
          </CardHeader>

          <CardContent className="pb-6 pt-2">
            <form onSubmit={handleRegister} className="space-y-5">
              <div className="space-y-2">
                <Label htmlFor="nickname" className="text-blue-900">
                  {t.nickname}
                </Label>
                <Input
                  id="nickname"
                  placeholder={t.nickname}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  autoComplete="username"
                  className="h-11 rounded-xl border-blue-200 bg-white/90 shadow-sm placeholder:text-zinc-400 focus-visible:ring-blue-400"
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
                <Label htmlFor="password" className="text-blue-900">
                  {t.password}
                </Label>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    placeholder={t.password}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete="new-password"
                    className="h-11 rounded-xl border-blue-200 bg-white/90 pr-10 shadow-sm placeholder:text-zinc-400 focus-visible:ring-blue-400"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="absolute right-1.5 top-1.5 h-8 w-8 text-blue-700"
                    onClick={() => setShowPassword((v) => !v)}
                  >
                    {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                  </Button>
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
                <Label htmlFor="spokenLanguage" className="text-blue-900">
                  {t.spokenLanguage}
                </Label>
                <Select value={spokenLanguage} onValueChange={setSpokenLanguage}>
                  <SelectTrigger className="h-11 w-full rounded-xl border-blue-200 bg-white/90 px-3 text-sm text-blue-900 shadow-sm">
                    <SelectValue placeholder={t.notSelected} />
                  </SelectTrigger>
                  <SelectContent>
                    {spokenLanguageOptions.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>
                        {opt.label}
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

              <motion.div whileHover={{ y: -1 }} whileTap={{ y: 0 }}>
                <Button
                  type="submit"
                  disabled={loading}
                  className="group h-11 w-full rounded-xl bg-gradient-to-r from-blue-600 to-cyan-500 text-white shadow-lg ring-1 ring-blue-300 transition-all hover:shadow-blue-200"
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
                </Button>
              </motion.div>

              <Button
                type="button"
                variant="outline"
                className="h-11 w-full rounded-xl border-blue-200/80 bg-white/80 text-blue-700 hover:bg-blue-50"
                onClick={() => handleNavigate("/login")}
              >
                <ArrowLeft className="mr-2 h-4 w-4" />
                {t.login}
              </Button>
            </form>
            <div className="mt-6 text-center text-xs text-zinc-500">
              © {new Date().getFullYear()} ShigaChat
            </div>
          </CardContent>
        </Card>
      </motion.div>

      <ConfirmDialog
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
