// Phase 4 — the single route/feature gating contract.
//
// A Premium surface renders <PremiumGate surface="coach">…</PremiumGate>. No screen
// re-implements entitlement logic, and no Free surface is ever wrapped.
//
// Loading never unlocks Premium and never traps the user: while the entitlement is
// being read we show the shared skeleton, and any other non-access state routes to
// the dismissible value path (the paywall) with the free areas named.

import React from "react";
import { Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useSemanticTokens } from "@/src/theme/semantic";
import { LayoutSkeleton, StatusAnnouncement } from "@/src/ui/state";

import { Paywall } from "./Paywall";
import { usePremium } from "./PremiumContext";
import { PREMIUM_AREA_NAMES, Surface, gate, isPremiumSurface } from "./entitlement";

/** Every surface that has locked-state copy, so the two can never drift apart. */
export type GateableSurface = Extract<Surface, keyof typeof PREMIUM_AREA_NAMES>;

export function PremiumGate({
  surface,
  children,
  headerOffset = 0,
}: {
  surface: GateableSurface;
  children: React.ReactNode;
  headerOffset?: number;
}) {
  const t = useSemanticTokens();
  const insets = useSafeAreaInsets();
  const { resolution } = usePremium();
  const decision = gate(surface, resolution);

  if (decision === "allow") return <>{children}</>;

  if (decision === "loading") {
    return (
      <View
        style={{ flex: 1, backgroundColor: t.color.bg, paddingTop: insets.top + 24, paddingHorizontal: t.space.lg, gap: t.space.md }}
        testID={`checking-${surface}`}
      >
        {/* A skeleton on its own reads as an empty screen. Say what is happening. */}
        <Text style={[t.type.body, { color: t.color.textMuted }]}>Checking your Premium access…</Text>
        <StatusAnnouncement message="Checking your Premium access" visible={false} />
        <LayoutSkeleton rows={3} />
      </View>
    );
  }

  // The paywall carries ONE header on every surface. It used to be overridden
  // per surface from PREMIUM_ENTRY_COPY, which meant the screen introduced
  // itself differently depending on which lock you touched — and made the
  // shared title in PAYWALL_COPY dead copy that never rendered.
  return (
    <View style={{ flex: 1, backgroundColor: t.color.bg }} testID={`locked-${surface}`}>
      <Paywall headerOffset={headerOffset} />
    </View>
  );
}

/** Exported for tests and for the tab bar's accessible lock labels. */
export { isPremiumSurface };
