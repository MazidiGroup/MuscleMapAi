import AsyncStorage from "@react-native-async-storage/async-storage";
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

import { DEFAULT_MODE, PALETTES, Palette, ThemeMode } from "./tokens";

type ThemeCtx = {
  mode: ThemeMode;
  T: Palette;
  setMode: (mode: ThemeMode) => void;
};

const STORAGE_KEY = "mma.appearance.v1";
const MODES: ThemeMode[] = ["day", "night", "dim"];
const VALUE: ThemeCtx = { mode: DEFAULT_MODE, T: PALETTES[DEFAULT_MODE], setMode: () => {} };

const Ctx = createContext<ThemeCtx>(VALUE);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [mode, setModeState] = useState<ThemeMode>(DEFAULT_MODE);

  useEffect(() => {
    let alive = true;
    AsyncStorage.getItem(STORAGE_KEY)
      .then((stored) => {
        if (alive && MODES.includes(stored as ThemeMode)) setModeState(stored as ThemeMode);
      })
      .catch(() => {});
    return () => { alive = false; };
  }, []);

  const setMode = useCallback((next: ThemeMode) => {
    setModeState(next);
    AsyncStorage.setItem(STORAGE_KEY, next).catch(() => {});
  }, []);

  const value = useMemo<ThemeCtx>(() => ({ mode, T: PALETTES[mode], setMode }), [mode, setMode]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useTheme(): ThemeCtx {
  return useContext(Ctx);
}
