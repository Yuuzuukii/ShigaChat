import React, { useContext, useEffect } from "react";
import { BrowserRouter as Router, Route, Routes, Navigate, useNavigate } from "react-router-dom";
import Shinki from "./components/Shinki";
import Navbar from "./components/NavBar";
import New from "./components/New";
import Home from "./components/home";
import Keyword from "./components/keyword";
import Category from "./components/Category"
import CategoryDetail from "./components/CategoryDetail"; // 新しいカテゴリ詳細ページ
import Question_Admin from "./components/Admin/Question_Admin";
import Q_List from "./components/Admin/Q_List";
import { UserContext } from "./UserContext";
import {BASE_PATH} from "./config/constants"
import { redirectToLogin } from "./utils/auth";

// トークン切れイベントハンドラーのコンポーネント
function TokenExpiredHandler() {
  const navigate = useNavigate();
  
  useEffect(() => {
    const handleTokenExpired = (event) => {
      console.warn("🔒 トークンが切れました。ログインページにリダイレクトします。");
      const redirectPath = event.detail?.redirectPath;
      redirectToLogin(navigate, redirectPath);
    };
    
    window.addEventListener("tokenExpired", handleTokenExpired);
    
    return () => {
      window.removeEventListener("tokenExpired", handleTokenExpired);
    };
  }, [navigate]);
  
  return null; // このコンポーネントは何もレンダリングしない
}

function App() {
  const { user, isLoading } = useContext(UserContext);
  if (isLoading) return <p>Loading...</p>; // データ取得完了を待つ


  return (
    <Router basename = {BASE_PATH}>
      <TokenExpiredHandler />
      <Routes>
        <Route path="" element={<Navigate to="/new" />} />
        {/* Auth pages are outside Layout */}
        <Route path="/shinki" element={<Shinki />} />
        <Route path="/new" element={<New />} />
        {/* App pages wrapped by Navbar (header+sidebar) */}
        <Route element={<Navbar />}>
          <Route path="/home" element={<Home />} />
          <Route path="/keyword" element={<Keyword />} />
          <Route path="/category" element={<Category />} />
          <Route path="/category/:categoryId" element={<CategoryDetail />} />
          <Route path="/admin/QuestionAdmin" element={<Question_Admin />} />
          <Route path="/admin/category/:categoryId" element={<Q_List />} />
        </Route>
      </Routes>
    </Router>
  );
}

export default App;
