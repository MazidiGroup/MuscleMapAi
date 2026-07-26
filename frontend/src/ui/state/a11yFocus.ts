// Accessibility focus helpers.
//
// `findNodeHandle` / `setAccessibilityFocus` are native-only APIs; on web they
// throw. Focus management therefore degrades to a no-op on web while remaining
// fully functional on iOS and Android.

import { AccessibilityInfo, Platform, findNodeHandle } from "react-native";

export const SUPPORTS_A11Y_FOCUS = Platform.OS === "ios" || Platform.OS === "android";

export function nodeHandleOf(ref: { current: unknown } | null | undefined): number | null {
  if (!SUPPORTS_A11Y_FOCUS || !ref?.current) return null;
  try {
    return findNodeHandle(ref.current as never);
  } catch {
    return null;
  }
}

export function focusAccessibility(target: { current: unknown } | number | null | undefined) {
  if (!SUPPORTS_A11Y_FOCUS || target == null) return;
  const handle = typeof target === "number" ? target : nodeHandleOf(target);
  if (handle == null) return;
  try {
    AccessibilityInfo.setAccessibilityFocus(handle);
  } catch {
    /* focus is best-effort */
  }
}
