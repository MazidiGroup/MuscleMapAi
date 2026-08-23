// DEVELOPMENT-ONLY harness (not linked from the app UI, same pattern as
// app/dev/state-system.tsx). The store SDK does not exist on web, so this route
// mounts the real Paywall against deterministic fixtures to capture evidence for
// product selection, purchase and restore states.
//
// The fixture prices below are FIXTURES, not app copy: production display data
// always comes from RevenueCat/App Store-localised product data. Because a
// fixture price must never be reachable in a shipped build, the route component
// below is a guard only: in a production build it redirects and the fixture
// component is never mounted, so no fixture package, price, trial or entitlement
// state is ever created.

import { Redirect } from "expo-router";
import React, { useMemo, useState } from "react";
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Paywall } from "@/src/premium/Paywall";
import {
  OfferingState,
  PremiumContextForFixtures,
  PremiumContextValue,
} from "@/src/premium/PremiumContext";
import { PurchaseOutcome, RestoreOutcome } from "@/src/premium/entitlement";
import { useSemanticTokens } from "@/src/theme/semantic";

/**
 * Route entry point. `__DEV__` is a build-time constant, so in a production build
 * this returns before any fixture state or fixture JSX exists. "/" is the app's
 * index route, which redirects to the free Plan tab — no account, no Premium and
 * no onboarding is required, and it can never redirect back here.
 */
export default function PaywallStatesRoute() {
  if (!__DEV__) {
    return <Redirect href="/" />;
  }
  return <PaywallStatesHarness />;
}

const FIXTURE_PACKAGES = [
  {
    identifier: "$rc_monthly",
    label: "Monthly",
    packageType: "MONTHLY",
    product: { identifier: "p_m", priceString: "£4.99", subscriptionPeriod: "P1M", pricePerMonthString: "£4.99" },
    raw: { identifier: "$rc_monthly" },
  },
  {
    identifier: "$rc_annual",
    label: "Yearly",
    packageType: "ANNUAL",
    product: {
      identifier: "p_y",
      priceString: "£39.99",
      subscriptionPeriod: "P1Y",
      pricePerMonthString: "£3.33",
      introPrice: { price: 0, period: "P1W" },
    },
    raw: { identifier: "$rc_annual" },
  },
];

type Scenario = "ready" | "loading" | "no-offering" | "purchase-busy" | "verified" | "restore-nothing";

function PaywallStatesHarness() {
  const t = useSemanticTokens();
  const insets = useSafeAreaInsets();
  const [scenario, setScenario] = useState<Scenario>("ready");

  const value: PremiumContextValue = useMemo(() => {
    const offeringState: OfferingState =
      scenario === "loading" ? "loading" : scenario === "no-offering" ? "empty" : "ready";
    return {
      isPremium: false,
      resolution: { access: false, source: "none", state: "ready" },
      loading: false,
      packages: scenario === "no-offering" ? [] : (FIXTURE_PACKAGES as any),
      offeringState,
      trialEligibility: { $rc_annual: "eligible", $rc_monthly: "ineligible" },
      busy: scenario === "purchase-busy" ? "purchase" : null,
      purchase: async (): Promise<PurchaseOutcome> => "verified",
      restorePurchases: async (): Promise<RestoreOutcome> =>
        scenario === "restore-nothing" ? "nothing_to_restore" : "verified",
      refreshOfferings: async () => {},
    };
  }, [scenario]);

  return (
    <View style={{ flex: 1, backgroundColor: t.color.bg, paddingTop: insets.top }}>
      <ScrollView horizontal contentContainerStyle={styles.bar} showsHorizontalScrollIndicator={false}>
        {(["ready", "loading", "no-offering", "purchase-busy", "verified", "restore-nothing"] as Scenario[]).map((s) => (
          <TouchableOpacity
            key={s}
            onPress={() => setScenario(s)}
            style={[styles.chip, { borderColor: scenario === s ? t.color.accent : "transparent" }]}
            testID={`fx-${s}`}
          >
            <Text style={[t.type.caption, { color: t.color.text }]}>{s}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
      <PremiumContextForFixtures.Provider value={value}>
        <Paywall />
      </PremiumContextForFixtures.Provider>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { gap: 8, paddingHorizontal: 12, paddingVertical: 8, alignItems: "center" },
  chip: { borderRadius: 999, paddingHorizontal: 12, height: 44, justifyContent: "center" },
});
