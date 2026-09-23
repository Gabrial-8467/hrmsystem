"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";

type Theme = "light" | "dark" | "system";

interface ThemeContextType {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
  isDark: boolean;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(() => {
    if (typeof window === "undefined") return "light";
    return (localStorage.getItem("hrms_theme") as Theme) || "light";
  });
  const [isDark, setIsDark] = useState<boolean>(
    () =>
      theme === "dark" ||
      (theme === "system" && typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: dark)").matches),
  );

  useEffect(() => {
    const root = document.documentElement;
    const dark = theme === "dark" || (theme === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
    root.classList.toggle("dark", dark);
    localStorage.setItem("hrms_theme", theme);
  }, [theme]);

  const setTheme = (t: Theme) => {
    setThemeState(t);
    setIsDark(t === "dark" || (t === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches));
  };

  const toggleTheme = () => {
    const next = isDark ? "light" : "dark";
    setThemeState(next);
    setIsDark(!isDark);
  };

  return (
    <ThemeContext.Provider value={{ theme, setTheme, toggleTheme, isDark }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error("useTheme must be used within a ThemeProvider");
  }
  return context;
}

export function ThemeToggle() {
  const { isDark, toggleTheme } = useTheme();

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={toggleTheme}
      className="size-8 text-muted-foreground hover:text-foreground shrink-0 rounded-full"
      aria-label="Toggle dark/light theme"
    >
      {isDark ? <Sun className="size-4 text-amber-400" /> : <Moon className="size-4" />}
    </Button>
  );
}
