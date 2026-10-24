import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./App.css";
// Glass materials, by area (order matters: later files refine earlier ones).
import "./styles/navigation.css";
import "./styles/native-glass.css";
import "./styles/controls.css";
import "./styles/favorites.css";
import "./styles/loadouts.css";
import "./styles/game-mods.css";
import "./styles/import-review.css";
import "./styles/settings.css";
import "./styles/themes-and-motion.css";
import "./styles/gallery.css";
import "./styles/library.css";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
