import React, { useState, useEffect, useContext } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import {
  API_BASE_URL,
  translations,
  languageCodeToId,
  languageLabelToCode,
} from "../config/constants";
import './Shinki.css';

const Shinki = () => {
  const [nickname, setNickname] = useState('');
  const [password, setPassword] = useState('');
  const [language, setLanguage] = useState('en');
  const [showPassword, setShowPassword] = useState(false);
  const [age, setAge] = useState('');
  const [gender, setGender] = useState('');
  const [spokenLanguage, setSpokenLanguage] = useState('');
  const [success, setSuccess] = useState('');
  const [error, setError] = useState('');
  const navigate = useNavigate();
  
  const t = translations[language];

  const handleLanguageChange = async (event) => {
    const newLanguageCode = event.target.value;
    setLanguage(newLanguageCode); // 表示を即時更新
  };

  const handleRegister = (e) => {
    e.preventDefault();

    if (!nickname || !password || !age || !gender || !spokenLanguage) {
      setError(t.errorAllFields);
      return;
    }

    axios
      .post(`${API_BASE_URL}/user/register`, {
        nickname,
        password,
        spoken_language: spokenLanguage,
        gender,
        age: parseInt(age, 10),
      })
      .then(() => {
        setSuccess(t.successRegistration);
        navigate('/new');
      })
      .catch(() => {
        setError(t.errorRegistration);
      });
  };

  return (
    <div className="container-add-course">
      <header className="header">
        <div className="language-wrapper">
          <img src="./globe.png" alt="言語" className="globe-icon" />
          <select className="languageSelector" onChange={handleLanguageChange} value={language}>
            <option value="ja">日本語</option>
            <option value="en">English</option>
            <option value="zh">中文</option>
            <option value="vi">Tiếng Việt</option>
            <option value="ko">한국어</option>
          </select>
        </div>
        <h1 className="title">Shiga Chat</h1>
      </header>
      <div className="login-box">
        <h1 className="kotoba">{t.signUp}</h1>
        <form onSubmit={handleRegister}>
          <div>
            <label className="name">{t.nickname}:</label>
            <input
              type="text"
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
              placeholder={t.nickname + "を入力して下さい"}
            />
          </div>

          <div>
            <label className="name">{t.password}:</label>
            <div className="password-wrapper">
              <input
                id="password"
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={t.password + "を入力して下さい"}
              />
              <button
                type="button"
                className="toggle-password"
                onClick={() => setShowPassword(!showPassword)}
              >
                {showPassword ? '👁️' : ""}
              </button>
            </div>

          </div>

          <div>
            <label className="name">{t.age}:</label>
            <input
              type="number"
              value={age}
              onChange={(e) => setAge(e.target.value)}
              placeholder={t.age + "を入力して下さい"}
              min="0"
            />
          </div>

          <div>
            <label className="name">{t.gender}:</label>
            <select id="gender" value={gender} onChange={(e) => setGender(e.target.value)}>
              <option value="" disabled>{t.gender + "を選択してください"}</option> // 追加
              <option value="男性">{t.male}</option>
              <option value="女性">{t.female}</option>
              <option value="その他">{t.other}</option>
            </select>
          </div>

          <div>
            <label className="name">{t.spokenLanguage}:</label>
            <select
              id="spokenLanguage"
              value={spokenLanguage}
              onChange={(e) => setSpokenLanguage(e.target.value)}
            >
              <option value="" disabled>{t.spokenLanguage + "を選択してください"}</option> // 追加
              <option value="日本語">日本語</option>
              <option value="English">English</option>
              <option value="Tiếng Việt">Tiếng Việt</option>
              <option value="中文">中文</option>
              <option value="한국어">한국어</option>
            </select>
          </div>

          <button className="submit">{t.register}</button>
        </form>

        {success && <p style={{ color: 'green' }}>{success}</p>}
        {error && <p style={{ color: 'red' }}>{error}</p>}
      </div>
    </div>
  );
};

export default Shinki;
