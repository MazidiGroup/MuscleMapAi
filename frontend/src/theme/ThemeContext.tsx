// Theme context.
//
// The app ships ONE theme: night. Light mode is not part of the approved design,
// has no reviewed token set, and no longer exists in the code — so there is no
// mode state, no persisted preference and no toggle. `useTheme()` stays because
// every screen reads its palette through it.

import React, { createContext, useContext } from "react";

import { DEFAULT_MODE, PALETTES, Palette, ThemeMode } from "./tokens";

type ThemeCtx = {
  mode: ThemeMode;
  T: Palette;
};

const VALUE: ThemeCtx = { mode: DEFAULT_MODE, T: PALETTES[DEFAULT_MODE] };

const Ctx = createContext<ThemeCtx>(VALUE);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  return <Ctx.Provider value={VALUE}>{children}</Ctx.Provider>;
}

export function useTheme(): ThemeCtx {
  return useContext(Ctx);
}
