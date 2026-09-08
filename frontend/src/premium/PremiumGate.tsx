// Phase 4 — the single route/feature gating contract.
//
// A Premium surface renders <PremiumGate surface="coach">…</PremiumGate>. No screen
// re-implements entitlement logic. The whole app is Premium, so the gate a person
// actually meets is `AppPremiumWall` at the root; the per-surface gates remain as
// defence in depth for deep links and for a future free tier.
//
// Loading never unlocks Premium and never traps the user: while the entitlement is
// being read we show the shared skeleton, and any other non-access state routes to
// the value path (the paywall), where Restore, Terms and Privacy stay reachable.

import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useSegments } from "expo-router";

import { useSemanticTokens } from "@/src/theme/semantic";
import { LayoutSkeleton, StatusAnnouncement } from "@/src/ui/state";
import { usePlanStore } from "@/src/plan/planStore";

import { Paywall } from "./Paywall";
import { usePremium } from "./PremiumContext";
import { PREMIUM_AREA_NAMES, PREMIUM_ENTRY_COPY, Surface, gate, isPremiumSurface, onboardingInFront } from "./entitlement";

/** Every surface that has locked-state copy, so the two can never drift apart. */
export type GateableSurface = Extract<Surface, keyof typeof PREMIUM_AREA_NAMES>;

export function PremiumGate({
  surface,
  children,
  headerOffset = 0,
  title,
  body,
  showAccount = false,
}: {
  surface: GateableSurface;
  children: React.ReactNode;
  headerOffset?: number;
  /** Paywall header override; the shared title is used when absent. */
  title?: string;
  body?: string;
  /** Sign in / sign out / delete account on the paywall — the root wall only. */
  showAccount?: boolean;
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
      <Paywall headerOffset={headerOffset} title={title} body={body} showAccount={showAccount} />
    </View>
  );
}

/**
 * Routes that stay open without Premium: signing in, the legal pages the paywall
 * itself links to, and the development harnesses. Everything else is the app,
 * and the app is Premium.
 */
export const OPEN_ROUTES = new Set(["login", "auth", "terms", "privacy", "references", "dev"]);

/**
 * The one wall. Mounted once at the root, above every route.
 *
 * Onboarding runs in front of it: Welcome, the three questions and the build
 * all happen before a plan exists, because a wall with nothing behind it sells
 * nothing. The moment a plan exists the wall stands — and it stands again for a
 * lapsed subscription, with the person's plan and history intact behind it.
 * "Exists" is the whole test (see `onboardingInFront`): the onboarding step is
 * not consulted, because a plan owner sent back into the questions must not
 * lift the wall for every other route while they are there.
 *
 * It is an OVERLAY, not a replacement: the navigator underneath stays mounted.
 * The wall's own Terms, Privacy and Sign in links navigate that navigator, and
 * unmounting it made every one of them throw ("navigate before mounting the
 * Root Layout"). Those routes are open, so the overlay lifts while one is
 * showing and returns on the way back. Deep links are covered by construction:
 * whatever route a link resolves to renders beneath the wall.
 */
export function AppPremiumWall({ children }: { children: React.ReactNode }) {
  const segments = useSegments() as readonly string[];
  const hydrated = usePlanStore((s) => s.hydrated);
  const plan = usePlanStore((s) => s.plan);
  const { resolution } = usePremium();

  const top = segments[0];
  const open = !!top && OPEN_ROUTES.has(top);
  // Not hydrated yet: nothing owner-scoped is known, and the plan tab shows its
  // own loading screen. Otherwise the plan's existence decides, on the plan tab.
  const preOnboarding = !hydrated || onboardingInFront(segments, !!plan);
  const walled = !open && !preOnboarding && gate("app", resolution) !== "allow";

  const entry = PREMIUM_ENTRY_COPY.app;
  return (
    <View style={{ flex: 1 }}>
      {/* Hidden from assistive tech while covered, so VoiceOver cannot read the
          plan through the wall or land focus behind it. */}
      <View
        style={{ flex: 1 }}
        accessibilityElementsHidden={walled}
        importantForAccessibility={walled ? "no-hide-descendants" : "auto"}
      >
        {children}
      </View>
      {walled ? (
        <View style={StyleSheet.absoluteFill} testID="app-wall">
          <PremiumGate surface="app" title={entry.title} body={entry.body} showAccount>
            {null}
          </PremiumGate>
        </View>
      ) : null}
    </View>
  );
}

/** Exported for tests and for the tab bar's accessible lock labels. */
export { isPremiumSurface };
