import React, { useState } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Globe, Eye, EyeOff, UserPlus, ArrowLeft, Loader2 } from 'lucide-react';

import { API_BASE_URL, translations } from "../config/constants";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";

const Shinki = () => {
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [language, setLanguage] = useState('en');
  const [showPassword, setShowPassword] = useState(false);
  const [spokenLanguage, setSpokenLanguage] = useState('');
  const [success, setSuccess] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const t = translations[language] || translations.en;

  const handleLanguageChange = (event) => {
    const newLanguageCode = event.target.value;
    setLanguage(newLanguageCode);
    try { localStorage.setItem('shigachat_lang', newLanguageCode); } catch {}
  };

  const handleRegister = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    if (!name || !password || !spokenLanguage) {
      setError(t.errorAllFields);
      return;
    }
    setLoading(true);
    try {
      await axios.post(`${API_BASE_URL}/user/register`, {
        name,
        password,
        spoken_language: spokenLanguage,
      });
      setSuccess(t.successRegistration);
      navigate('/new');
    } catch (e) {
      setError(t.errorRegistration);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative min-h-screen w-full overflow-hidden">
      {/* Background */}
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(60%_50%_at_10%_10%,rgba(59,130,246,0.12),transparent_60%),radial-gradient(50%_50%_at_90%_20%,rgba(14,165,233,0.12),transparent_60%),linear-gradient(to_bottom,rgba(239,246,255,1),rgba(255,255,255,1))]" />
      <div className="pointer-events-none absolute -top-24 -left-24 h-72 w-72 rounded-full bg-blue-300/30 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-24 -right-24 h-72 w-72 rounded-full bg-cyan-300/30 blur-3xl" />
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(rgba(59,130,246,0.05)_1px,transparent_1px),linear-gradient(90deg,rgba(59,130,246,0.05)_1px,transparent_1px)] bg-[size:28px_28px]" />

      {/* Centered card */}
      <div className="relative z-0 mx-auto grid min-h-screen w-full max-w-6xl place-items-center px-4">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: 'easeOut' }}
          className="w-full max-w-2xl"
        >
          <Card className="group relative w-full overflow-hidden border border-blue-100/70 bg-white/80 shadow-xl shadow-blue-100/40 backdrop-blur-xl">
            <div className="pointer-events-none absolute -left-24 top-0 h-64 w-40 -skew-x-12 bg-gradient-to-b from-white/60 to-transparent opacity-0 transition-opacity duration-700 group-hover:opacity-100" />

            <CardHeader className="pb-4 relative">
              {/* Back to login */}
              <div className="absolute left-4 top-4">
                <Button variant="ghost" size="sm" className="text-blue-700" onClick={() => navigate('/new')}>
                  <ArrowLeft className="mr-1 h-4 w-4" />
                  {t.login}
                </Button>
              </div>

              {/* Language selector pinned to top-right */}
              <div className="absolute right-4 top-4 flex items-center gap-2">
                <Globe className="h-4 w-4 text-blue-600" />
                <Select value={language} onValueChange={(val)=>handleLanguageChange({target:{value:val}})}>
                  <SelectTrigger className="h-8 w-[140px] rounded-lg border-blue-200/80 bg-white/80 px-2 text-xs text-blue-700 shadow-sm backdrop-blur">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ja">日本語</SelectItem>
                    <SelectItem value="en">English</SelectItem>
                    <SelectItem value="zh">中文</SelectItem>
                    <SelectItem value="vi">Tiếng Việt</SelectItem>
                    <SelectItem value="ko">한국어</SelectItem>
                    <SelectItem value="pt">Português</SelectItem>
                    <SelectItem value="es">Español</SelectItem>
                    <SelectItem value="de">Tagalog</SelectItem>
                    <SelectItem value="id">Bahasa Indonesia</SelectItem>
                    
                  </SelectContent>
                </Select>
              </div>

              {/* Centered title */}
              <CardTitle className="flex flex-col items-center gap-2 text-blue-800">
                <span className="text-2xl tracking-wide">Sign Up</span>
              </CardTitle>
            </CardHeader>

            <CardContent className="pb-6 pt-2">
              <form onSubmit={handleRegister} className="space-y-5">
                <div className="space-y-2">
                  <Label htmlFor="nickname" className="text-blue-900">{t.nickname}</Label>
                  <Input
                    id="nickname"
                    placeholder={t.nickname}
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    autoComplete="username"
                    className="h-11 rounded-xl border-blue-200 bg-white/90 shadow-sm placeholder:text-zinc-400 focus-visible:ring-blue-400"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="password" className="text-blue-900">{t.password}</Label>
                  <div className="relative">
                    <Input
                      id="password"
                      type={showPassword ? 'text' : 'password'}
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
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                    >
                      {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                    </Button>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="spokenLanguage" className="text-blue-900">{t.spokenLanguage}</Label>
                  <Select value={spokenLanguage} onValueChange={setSpokenLanguage}>
                    <SelectTrigger className="h-11 w-full rounded-xl border-blue-200 bg-white/90 px-3 text-sm text-blue-900 shadow-sm">
                      <SelectValue placeholder={t.notSelected} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="日本語">日本語</SelectItem>
                      <SelectItem value="English">English</SelectItem>
                      <SelectItem value="Tiếng Việt">Tiếng Việt</SelectItem>
                      <SelectItem value="中文">中文</SelectItem>
                      <SelectItem value="한국어">한국어</SelectItem>
                      <SelectItem value="Português">Português</SelectItem>
                      <SelectItem value="Español">Español</SelectItem>
                      <SelectItem value="Tagalog">Tagalog</SelectItem>
                      <SelectItem value="Bahasa Indonesia">Bahasa Indonesia</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {error && (
                  <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
                    {error}
                  </div>
                )}
                {success && (
                  <div className="rounded-md border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-700" role="status">
                    {success}
                  </div>
                )}

                <motion.div whileHover={{ y: -1 }} whileTap={{ y: 0 }}>
                  <Button
                    type="submit"
                    disabled={loading}
                    className="group h-11 w-full rounded-xl bg-gradient-to-r from-blue-600 to-cyan-500 text-white shadow-lg ring-1 ring-blue-300 transition-all hover:shadow-blue-200 focus-visible:ring-2 focus-visible:ring-offset-2"
                  >
                    {loading ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        {t.signingUp || 'Signing up...'}
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
                  onClick={() => navigate('/new')}
                >
                  <ArrowLeft className="mr-2 h-4 w-4" />
                  {t.login}
                </Button>
              </form>

              <div className="mt-6 text-center text-xs text-zinc-500">© {new Date().getFullYear()} ShigaChat</div>
            </CardContent>
          </Card>
        </motion.div>
      </div>
    </div>
  );
};

export default Shinki;
