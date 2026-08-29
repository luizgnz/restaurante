import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App.tsx";
import "./styles.css";

const parametros = new URLSearchParams(window.location.search);
if (parametros.has("ui")) {
  parametros.delete("ui");
  const consulta = parametros.toString();
  window.history.replaceState(null, "", `${window.location.pathname}${consulta ? `?${consulta}` : ""}${window.location.hash}`);
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
