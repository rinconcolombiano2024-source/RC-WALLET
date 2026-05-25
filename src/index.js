import React from "react";
import ReactDOM from "react-dom/client";

import App from "./App";

import { MiniKitProvider }
from "@worldcoin/minikit-js/minikit-provider";

const root =
  ReactDOM.createRoot(
    document.getElementById("root")
  );

root.render(

  <MiniKitProvider>

    <App />

  </MiniKitProvider>

);
