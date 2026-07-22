// Theme context + persistence. Wraps the app so any screen can call
// `useTheme()` to read the current palette and `toggleTheme()` to flip modes.
//
// Persistence uses AsyncStorage-via-`storage` (our web/native shim) so the
// user's choice survives across launches. Night is the launch default.

import React, { createContext, useContext, useEffect, useState } from "react";

import { storage } from "@/src/utils/storage";

import { DEFAULT_MODE, PALETTES, Palette, ThemeMode } from "./tokens";

const KEY = "mma.themeMode";

type ThemeCtx = {
  mode: ThemeMode;
  T: Palette;
  setMode: (m: ThemeMode) => void;
  toggleTheme: () => void;
};

const Ctx = createContext<ThemeCtx | null>(null);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [mode, setModeState] = useState<ThemeMode>(DEFAULT_MODE);

  useEffect(() => {
    (async () => {
      try {
        const saved = await storage.getItem<ThemeMode | null>(KEY, null);
        if (saved === "day" || saved === "night") setModeState(saved);
      } catch {
        /* ignore */
      }
    })();
  }, []);

  const setMode = (m: ThemeMode) => {
    setModeState(m);
    storage.setItem(KEY, m).catch(() => {});
  };

  const value: ThemeCtx = {
    mode,
    T: PALETTES[mode],
    setMode,
    toggleTheme: () => setMode(mode === "night" ? "day" : "night"),
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useTheme(): ThemeCtx {
  const ctx = useContext(Ctx);
  if (!ctx) {
    // Sensible fallback for components rendered before the provider mounts
    // (e.g. during error boundaries). Returns the night palette.
    return {
      mode: DEFAULT_MODE,
      T: PALETTES[DEFAULT_MODE],
      setMode: () => {},
      toggleTheme: () => {},
    };
  }
  return ctx;
}
