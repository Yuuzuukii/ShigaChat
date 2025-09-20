import React from "react";
import ReactDOM from "react-dom";
import "./index.css";
import "./tailwind.css";
import App from "./App";
import { UserProvider } from "./UserContext"; // UserProvider を追加

ReactDOM.render(
  <React.StrictMode>
    <UserProvider> {/* ここで App をラップ */}
      <App />
    </UserProvider>
  </React.StrictMode>,
  document.getElementById("root")
);
