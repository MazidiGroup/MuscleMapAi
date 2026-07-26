// Reduced-motion preference, live.
//
// Used to decide whether an exercise animation may autoplay. When Reduce Motion
// is on we keep the poster and an explicit Play control instead of moving media
// on arrival.

import { useEffect, useState } from "react";
import { AccessibilityInfo } from "react-native";

export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    let active = true;
    AccessibilityInfo.isReduceMotionEnabled().then((v) => {
      if (active) setReduced(!!v);
    });
    const sub = AccessibilityInfo.addEventListener("reduceMotionChanged", (v) => setReduced(!!v));
    return () => {
      active = false;
      sub.remove();
    };
  }, []);

  return reduced;
}
