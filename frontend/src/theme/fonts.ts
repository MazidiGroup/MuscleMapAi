// Font files for the display face, loaded once by app/_layout.tsx before the
// splash hides. Kept apart from tokens.ts so the pure token modules never
// require a binary asset.
import { DISPLAY_FONT_BOLD, NUMERAL_FONT } from "./tokens";

export const DISPLAY_FONT_FILES = {
  [NUMERAL_FONT]: require("../../assets/fonts/BarlowCondensed-ExtraBold.ttf"),
  [DISPLAY_FONT_BOLD]: require("../../assets/fonts/BarlowCondensed-Bold.ttf"),
};
