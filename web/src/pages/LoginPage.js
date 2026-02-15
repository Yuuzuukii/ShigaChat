/**
 * LoginPage - S01 ログイン画面
 * 仕様書 W01: 入力途中の遷移警告ダイアログ実装
 */
import React, { useState, useEffect, useContext } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Eye, EyeOff, LogIn, Loader2 } from "lucide-react";
import { UserContext } from "../contexts/UserContext";
import { useLanguage } from "../hooks/useLanguage";
import { postLogin, fetchCurrentUser } from "../services/api";
import AuthLayout from "../components/layout/AuthLayout";
import LanguageSelector from "../components/layout/LanguageSelector";
import ConfirmDialog from "../components/common/ConfirmDialog";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";

export default function LoginPage() {
  const [nickname, setNickname] = useState("");
  const [password, setPassword] = useState("");
  const [nicknameErrorKey, setNicknameErrorKey] = useState("");
  const [passwordErrorKey, setPasswordErrorKey] = useState("");
  const [errorMessageKey, setErrorMessageKey] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const { user, setToken, setUser } = useContext(UserContext);
  const { t, changeLanguageLocal, language } = useLanguage();
  const navigate = useNavigate();

  // W01: 遷移警告ダイアログ
  const [showLeaveDialog, setShowLeaveDialog] = useState(false);
  const [pendingNavPath, setPendingNavPath] = useState(null);

  const hasInput = nickname.trim() !== "" || password.trim() !== "";

  // Spec requirement: unauthenticated login page defaults to English.
  useEffect(() => {
    const hasToken = !!localStorage.getItem("token");
    if (!hasToken) {
      changeLanguageLocal("en");
    }
  }, [changeLanguageLocal]);

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

  // ログイン済みならリダイレクト
  useEffect(() => {
    if (user) {
      const redirectPath = localStorage.getItem("redirectAfterLogin");
      localStorage.removeItem("redirectAfterLogin");
      navigate(redirectPath && redirectPath !== "/login" && redirectPath !== "/" ? redirectPath : "/home", { replace: true });
    }
  }, [user, navigate]);

  const handleLogin = async () => {
    setNicknameErrorKey("");
    setPasswordErrorKey("");
    setErrorMessageKey("");
    if (!nickname.trim()) { setNicknameErrorKey("errorEmptyNickname"); return; }
    if (!password.trim()) { setPasswordErrorKey("errorEmptyPassword"); return; }
    if (!/^[A-Za-z0-9]{8,}$/.test(password)) { setPasswordErrorKey("errorPasswordTooShort"); return; }

    setLoading(true);
    try {
      const loginRes = await postLogin(nickname, password);
      if (!loginRes.ok) {
        if (loginRes.status === 401 || loginRes.status === 404) {
          // Show credential errors under the password field.
          setPasswordErrorKey("errorInvalidLogin");
        }
        else { setErrorMessageKey("errorServerConnection"); }
        return;
      }
      const { access_token } = await loginRes.json();
      localStorage.setItem("token", access_token);
      setToken(access_token);

      const userRes = await fetchCurrentUser();
      if (!userRes.ok) throw new Error();
      const userData = await userRes.json();
      const mapped = { id: userData.id, nickname: userData.name, spokenLanguage: userData.spoken_language };
      setUser(mapped);
      try { localStorage.setItem("user", JSON.stringify(mapped)); } catch {}

      const redirectPath = localStorage.getItem("redirectAfterLogin");
      localStorage.removeItem("redirectAfterLogin");
      navigate(redirectPath && redirectPath !== "/login" && redirectPath !== "/" ? redirectPath : "/home", { replace: true });
    } catch (error) {
      setErrorMessageKey("errorServerConnection");
      console.error("ログインエラー:", error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout>
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }} className="w-full max-w-2xl">
        <Card className="group relative w-full overflow-hidden border border-blue-100/70 bg-white/70 shadow-xl shadow-blue-100/40 backdrop-blur-xl">
          <div className="pointer-events-none absolute -left-24 top-0 h-64 w-40 -skew-x-12 bg-gradient-to-b from-white/60 to-transparent opacity-0 transition-opacity duration-700 group-hover:opacity-100" />

          <CardHeader className="pb-4 relative">
            <div className="absolute right-4 top-4">
              <LanguageSelector value={language} onChange={changeLanguageLocal} size="small" />
            </div>
            <CardTitle className="flex flex-col items-center gap-2 text-blue-800">
              <img src="./icon_192.png" alt="ShigaChat" className="h-10 w-10 rounded-xl shadow-sm" />
              <span className="text-2xl tracking-wide">ShigaChat</span>
            </CardTitle>
          </CardHeader>

          <CardContent className="pb-6 pt-2">
            <form onSubmit={(e) => e.preventDefault()} className="space-y-5">
              <div className="space-y-2">
                <Label htmlFor="nickname" className="text-blue-900">{t.nickname}</Label>
                <Input id="nickname" placeholder={t.nickname} value={nickname} onChange={(e) => setNickname(e.target.value)} autoComplete="username" className="h-11 rounded-xl border-blue-200 bg-white/90 shadow-sm placeholder:text-zinc-400 focus-visible:ring-blue-400" />
                {nicknameErrorKey && (
                  <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">{t[nicknameErrorKey]}</div>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="password" className="text-blue-900">{t.password}</Label>
                <div className="relative">
                  <Input id="password" type={showPassword ? "text" : "password"} placeholder={t.password} value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" className="h-11 rounded-xl border-blue-200 bg-white/90 pr-10 shadow-sm placeholder:text-zinc-400 focus-visible:ring-blue-400" />
                  <Button type="button" variant="ghost" size="icon" className="absolute right-1.5 top-1.5 h-8 w-8 text-blue-700" onClick={() => setShowPassword((v) => !v)}>
                    {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                  </Button>
                </div>
                {passwordErrorKey && (
                  <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">{t[passwordErrorKey]}</div>
                )}
              </div>

              {errorMessageKey && (
                <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">{t[errorMessageKey]}</div>
              )}

              <motion.div whileHover={{ y: -1 }} whileTap={{ y: 0 }}>
                <Button type="button" onClick={handleLogin} disabled={loading} className="group h-11 w-full rounded-xl bg-gradient-to-r from-blue-600 to-cyan-500 text-white shadow-lg ring-1 ring-blue-300 transition-all hover:shadow-blue-200">
                  {loading ? (<><Loader2 className="mr-2 h-4 w-4 animate-spin" />{t.signingIn || "Signing in..."}</>) : (<><LogIn className="mr-2 h-4 w-4 transition-transform group-hover:translate-x-0.5" />{t.login}</>)}
                </Button>
              </motion.div>

              <Button type="button" variant="outline" className="h-11 w-full rounded-xl border-blue-200/80 bg-white/80 text-blue-700 hover:bg-blue-50" onClick={() => handleNavigate("/register")}>
                {t.signUp}
              </Button>
            </form>
            <div className="mt-6 text-center text-xs text-zinc-500">© {new Date().getFullYear()} ShigaChat</div>
          </CardContent>
        </Card>
      </motion.div>

      {/* W01: 遷移警告ダイアログ */}
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
