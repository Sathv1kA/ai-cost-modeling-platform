import { useContext } from "react";
import { ThemeContext, type ThemeCtx } from "./themeContext";

export function useTheme(): ThemeCtx {
  const v = useContext(ThemeContext);
  if (!v) throw new Error("useTheme must be used within ThemeProvider");
  return v;
}
