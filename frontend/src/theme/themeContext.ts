import { createContext } from "react";

export type Theme = "light" | "dark";

export interface ThemeCtx {
  theme: Theme;
  toggle: () => void;
  setTheme: (t: Theme) => void;
}

export const ThemeContext = createContext<ThemeCtx | null>(null);
