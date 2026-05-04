import React from "react";
import ReactDOM from "react-dom";
import "flag-icons/css/flag-icons.min.css";
import "./index.css";
import "./tailwind.css";
import App from "./App";
import { UserProvider } from "./contexts/UserContext";

ReactDOM.render(
  React.createElement(
    React.StrictMode,
    null,
    React.createElement(UserProvider, null, React.createElement(App))
  ),
  document.getElementById("root")
);
