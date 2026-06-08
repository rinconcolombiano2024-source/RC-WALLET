import React from "react";
import ReactDOM from "react-dom/client";

import App from "./App.jsx";

import { MiniKit } from "@worldcoin/minikit-js";

MiniKit.install();

ReactDOM.createRoot(
  document.getElementById("root")
).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
