import React, { useContext } from "react";
import { BrowserRouter as Router, Route, Routes, Navigate } from "react-router-dom";
import Shinki from "./components/Shinki";
import NavBar from "./components/NavBar";
import New from "./components/New";
import Home from "./components/home";
import Keyword from "./components/keyword";
import CategoryDetail from "./components/CategoryDetail"; // 新しいカテゴリ詳細ページ
import Question_Admin from "./components/Admin/Question_Admin";
import Q_List from "./components/Admin/Q_List";
import { UserContext } from "./UserContext";


function App() {
  const { user, isLoading } = useContext(UserContext);
  if (isLoading) return <p>Loading...</p>; // データ取得完了を待つ


  return (
    <Router>
      <div>
        <NavBar />
        <Routes>
          <Route path="" element={<Navigate to="/new" />} /> {/* デフォルトリダイレクト */}
          <Route path="/shinki" element={<Shinki />} />
          <Route path="/new" element={<New />} />
          <Route path="/home" element={<Home />} />
          <Route path="/keyword" element={<Keyword />} />
          <Route path="/category/:categoryId" element={<CategoryDetail />} /> {/* 動的ルート */}
          <Route path="/admin/QuestionAdmin" element={<Question_Admin />} />
          <Route path="/admin/category/:categoryId" element={<Q_List />} />

        </Routes>
      </div>
    </Router>
  );
}

export default App;
