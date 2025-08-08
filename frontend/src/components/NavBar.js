import React, { useState, useEffect, useContext } from "react";
import { Link, useNavigate } from "react-router-dom";
import { UserContext } from "../UserContext";
import "./NavBar.css";


const translations = {
  ja: {
    login: "ログイン",
    signup: "新規登録",
    home: "ホーム",
    keyword: "キーワード検索",
    category: "カテゴリ検索",
    questionHistory: "質問履歴",
    viewingHistory: "閲覧履歴",
    questionAdmin: "🛠️質問管理",
    officialWebsite: "公式ホームページ",
    logout: "ログアウト",
  },
  en: {
    login: "Login",
    signup: "Sign Up",
    home: "Home",
    keyword: "Keyword Search",
    category: "Category Search",
    questionHistory: "Question History",
    viewingHistory: "Viewing History",
    questionAdmin: "🛠️Question Management",
    officialWebsite: "Official Website",
    logout: "Logout",
  },
  zh: {
    login: "登录",
    signup: "注册",
    home: "首页",
    keyword: "关键词搜索",
    category: "类别搜索",
    questionHistory: "问题历史",
    viewingHistory: "浏览历史",
    questionAdmin: "🛠️问题管理",
    officialWebsite: "官方网站",
    logout: "登出",
  },
  vi: {
    login: "Đăng nhập",
    signup: "Đăng ký",
    home: "Trang chủ",
    keyword: "Tìm kiếm từ khóa",
    category: "Tìm kiếm danh mục",
    questionHistory: "Lịch sử câu hỏi",
    viewingHistory: "Lịch sử xem",
    questionAdmin: "🛠️Quản lý câu hỏi",
    officialWebsite: "Trang web chính thức",
    logout: "Đăng xuất",
  },
  ko: {
    login: "로그인",
    signup: "회원 가입",
    home: "홈",
    keyword: "키워드 검색",
    category: "카테고리 검색",
    questionHistory: "질문 기록",
    viewingHistory: "조회 기록",
    questionAdmin: "🛠️질문 관리",
    officialWebsite: "공식 홈페이지",
    logout: "로그아웃",
  }

}

const NavBar = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [language, setLanguage] = useState("en"); // 初期言語を日本語に設定
  const [isAdmin, setIsAdmin] = useState(false); // 権限管理
  const { user, isLoading, logout } = useContext(UserContext);
  const navigate = useNavigate();

  const toggleMenu = () => {
    setIsOpen(!isOpen);
  };

  const closeMenu = () => {
    setIsOpen(false);
  };

  const handleLinkClick = () => {
    closeMenu(); // リンクがクリックされたらメニューを閉じる
  };

  const handleOverlayClick = (e) => {
    // 子要素のクリックを無視してオーバーレイクリックで閉じる
    if (e.target.classList.contains("menu")) {
      closeMenu();
    }
  };

  const handleLogout = () => {
    logout();
    setIsOpen(false);
    navigate("/new"); // HashRouter対応リダイレクト
    setLanguage("en");
  };

  // `user.spokenLanguage` を `language` に同期する
  useEffect(() => {
    if (user && user.spokenLanguage) {
      const languageMapping = {
        English: "en",
        日本語: "ja",
        "Tiếng Việt": "vi",
        中文: "zh",
        한국어: "ko",
      };
      setLanguage(languageMapping[user.spokenLanguage] || "en");
      //console.log("🔄 Navbar の言語が更新:", user.spokenLanguage);
    }
  }, [user]); // `user` が更新されたら `language` も更新

  const t = translations[language]; // 言語データを取得
  return (
    <>
      <nav className="navbar">
        {/* メニューアイコン */}
        <div className="menu-toggle" onClick={toggleMenu}>
          <span className="menu-icon">&#9776;</span>
        </div>

        {/* オーバーレイ */}
        {isOpen && <div className="overlay" onClick={closeMenu}></div>}

        {/* スライドメニュー */}
        <div className={`menu ${isOpen ? "open" : ""}`}>
          <button className="close-button" onClick={closeMenu}>
            ×
          </button>

          {isLoading ? (
            <li>Loading...</li>
          ) : user ? (
            <>
              
              <li>
                <Link to="/home" onClick={closeMenu}>{t.home}</Link>
              </li>
              <li>
                <Link to="/keyword" onClick={closeMenu}>{t.keyword}</Link>
              </li>
              <li>
                <Link to="/kategori" onClick={closeMenu}>{t.category}</Link>
              </li>
              <li>
                <Link to="/Shitsumonnrireki" onClick={closeMenu}>{t.questionHistory}</Link>
              </li>
              <li>
                <Link to="/Etsurannrireki" onClick={closeMenu}>{t.viewingHistory}</Link>
              </li>
              <li>
                  <Link to="/Admin/QuestionAdmin" onClick={closeMenu}>{t.questionAdmin}</Link>
                </li>
            
              <li>
                <a href="https://www.s-i-a.or.jp" className="important-link" target="_blank" rel="noopener noreferrer">
                  {t.officialWebsite}
                </a>
              </li>
              <li>
                <button onClick={handleLogout} className="logout-button">{t.logout}</button>
              </li>
            </>
          ) : (
            <>
              <li>
                <Link to="/new" onClick={closeMenu}>{t.login}</Link>
              </li>
              <li>
                <a href="https://www.s-i-a.or.jp" className="important-link" target="_blank" rel="noopener noreferrer">
                  {t.officialWebsite}
                </a>
              </li>
            </>
          )}
        </div>
      </nav>
    </>
  );
};

export default NavBar;

//もし、文字をクリックしてもメニューバーを閉じないようにするにはこちらのコードにする
//メニューバーを選択すると、バツボタンを押さないとメニューバーが閉じないようにするようにするコード↓

// import React, { useState } from 'react';
// import { Link } from 'react-router-dom';
// import './NavBar.css';

// const NavBar = () => {
//   const [isOpen, setIsOpen] = useState(false);

//   const toggleMenu = () => {
//     setIsOpen(!isOpen);
//   };

//   const closeMenu = () => {
//     setIsOpen(false);
//   };

//   return (
//     <>
//       <nav className="navbar">
//         <div className="menu-toggle" onClick={toggleMenu}>
//           <span className="menu-icon">&#9776;</span> メニュー
//         </div>

//         {isOpen && <div className="menu-backdrop" onClick={closeMenu}></div>}

//         <ul className={menu ${isOpen ? 'open' : ''}}>
//           <button className="close-button" onClick={closeMenu}>×</button>
//           <li><Link to="/shinki">新規登録</Link></li>
//           <li><Link to="/new">ログイン</Link></li>
//           <li><Link to="/home">ホーム</Link></li>
//           <li><Link to="/keyword">キーワード検索</Link></li>
//           <li><Link to="/kategori">カテゴリ検索</Link></li>
//           <li><Link to="/Shitsumonnrireki">質問履歴</Link></li>
//           <li><Link to="/Etsurannrireki">閲覧履歴</Link></li>
//         </ul>
//       </nav>
//     </>
//   );
// };

// export default NavBar;


