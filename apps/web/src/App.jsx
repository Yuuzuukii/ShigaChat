import React, { useContext } from "react";
import { BrowserRouter as Router, Route, Routes, Navigate } from "react-router-dom";
import { UserContext } from "./contexts/UserContext";
import { BASE_PATH, MAINTENANCE_MODE } from "./config/constants";

// Layouts
import AppLayout from "./features/layout/AppLayout";

// Pages
import LoginPage from "./pages/login/LoginPage";
import RegisterPage from "./pages/register/RegisterPage";
import HomePage from "./pages/home/HomePage";
import CategoryListPage from "./pages/category/list/CategoryListPage";
import CategoryDetailPage from "./pages/category/detail/CategoryDetailPage";
import NotFoundPage from "./pages/not-found/NotFoundPage";
import MaintenancePage from "./pages/maintenance/MaintenancePage";

function App() {
  const { isLoading } = useContext(UserContext);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 via-white to-cyan-50">
        <div className="text-lg text-gray-500">Loading...</div>
      </div>
    );
  }

  // メンテナンスモード: 全ルートをメンテナンス画面に置換
  if (MAINTENANCE_MODE) {
    return (
      <Router basename={BASE_PATH}>
        <Routes>
          <Route path="*" element={<MaintenancePage />} />
        </Routes>
      </Router>
    );
  }

  return (
    <Router basename={BASE_PATH}>
      <Routes>
        {/* ルート → ログイン画面にリダイレクト */}
        <Route path="" element={<Navigate to="/login" />} />

        {/* 認証前ページ（AppLayout外） */}
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />

        {/* 旧パスの後方互換リダイレクト */}
        <Route path="/new" element={<Navigate to="/login" replace />} />
        <Route path="/shinki" element={<Navigate to="/register" replace />} />

        {/* 認証後ページ（AppLayout内） */}
        <Route element={<AppLayout />}>
          <Route path="/home" element={<HomePage />} />
          <Route path="/category" element={<CategoryListPage />} />
          <Route path="/category/:categoryId" element={<CategoryDetailPage />} />
        </Route>

        {/* 404 キャッチオール */}
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </Router>
  );
}

export default App;
