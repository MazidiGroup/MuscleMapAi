import { Tabs } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { Platform, View, StyleSheet } from "react-native";

import { T } from "@/src/anatomy/ui";
import { usePremium } from "@/src/premium/PremiumContext";
import { gate } from "@/src/premium/entitlement";
import { useTheme } from "@/src/theme/ThemeContext";
import { usePlanStore } from "@/src/plan/planStore";
import { ONBOARDING_STEP_COUNT, routeStep } from "@/src/plan/onboarding";

function TabIcon({ name, color, size, locked }: { name: any; color: string; size: number; locked?: boolean }) {
  return (
    <View>
      <Ionicons name={name} size={size} color={color} />
      {locked && (
        <View style={styles.lockBadge}>
          <Ionicons name="lock-closed" size={11} color="#070A0F" />
        </View>
      )}
    </View>
  );
}

export default function TabsLayout() {
  const { resolution } = usePremium();
  // One gating contract decides the lock affordance too.
  const coachLocked = gate("coach", resolution) !== "allow";
  const exploreLocked = gate("explore", resolution) !== "allow";
  const { T: theme } = useTheme();

  // Welcome and the three onboarding questions are a single-purpose flow: there is
  // nothing to navigate to until onboarding has finished and a plan exists, so the
  // tab bar stays out of the way (and out of the accessibility tree) until then.
  // `hydrate()` is driven by ScopeBridge above this layout, so no read races here.
  const hydrated = usePlanStore((s) => s.hydrated);
  const step = usePlanStore((s) => s.step);
  const plan = usePlanStore((s) => s.plan);
  const preOnboarding = !hydrated || !plan || routeStep(step, !!plan) <= ONBOARDING_STEP_COUNT;

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: theme.accent,
        tabBarInactiveTintColor: theme.textMuted,
        tabBarStyle: preOnboarding
          ? { display: "none" }
          : {
              backgroundColor: theme.card,
              borderTopColor: theme.border,
              borderTopWidth: 1,
              height: Platform.OS === "ios" ? 86 : 64,
              paddingTop: 6,
              paddingBottom: Platform.OS === "ios" ? 28 : 8,
            },
        tabBarLabelStyle: { fontSize: 10, fontWeight: "600" },
        sceneStyle: { backgroundColor: theme.bg },
      }}
    >
      <Tabs.Screen
        name="plan"
        options={{ title: "Plan", tabBarIcon: ({ color, size }) => <TabIcon name="calendar-outline" size={size} color={color} /> }}
      />
      <Tabs.Screen
        name="workout"
        options={{ title: "Workout", tabBarIcon: ({ color, size }) => <TabIcon name="barbell-outline" size={size} color={color} /> }}
      />
      <Tabs.Screen
        name="coach"
        options={{
          title: "Coach",
          // The lock is never icon-only: the accessible name says "Premium".
          tabBarAccessibilityLabel: coachLocked ? "Coach, Premium" : "Coach",
          tabBarIcon: ({ color, size }) => <TabIcon name="sparkles-outline" size={size} color={color} locked={coachLocked} />,
        }}
      />
      <Tabs.Screen
        name="explore"
        options={{
          title: "Explore",
          tabBarAccessibilityLabel: exploreLocked ? "Explore, Premium" : "Explore",
          tabBarIcon: ({ color, size }) => <TabIcon name="cube-outline" size={size} color={color} locked={exploreLocked} />,
        }}
      />
      <Tabs.Screen
        name="library"
        options={{ title: "Library", tabBarIcon: ({ color, size }) => <TabIcon name="library-outline" size={size} color={color} /> }}
      />
      <Tabs.Screen name="learn" options={{ href: null }} />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  lockBadge: {
    position: "absolute",
    top: -5,
    right: -9,
    width: 17,
    height: 17,
    borderRadius: 9,
    backgroundColor: T.accent,
    alignItems: "center",
    justifyContent: "center",
  },
});
