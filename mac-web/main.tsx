import React from "react";
import { createRoot } from "react-dom/client";
import "@fontsource-variable/archivo";
import "@fontsource-variable/azeret-mono";
import "@fontsource-variable/caveat";
import "../app/globals.css";
import Booth from "../app/Booth";

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <Booth />
  </React.StrictMode>,
);
