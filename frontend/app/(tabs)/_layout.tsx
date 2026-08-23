import { Tabs } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { Platform, View, StyleSheet } from "react-native";
import { BlurView } from "expo-blur";
import { LinearGradient } from "expo-linear-gradient";

import { usePremium } from "@/src/premium/PremiumContext";
import { gate, isPremiumSurface, Surface } from "@/src/premium/entitlement";
import { useTheme } from "@/src/theme/ThemeContext";
import { usePlanStore } from "@/src/plan/planStore";
import { ONBOARDING_STEP_COUNT, routeStep } from "@/src/plan/onboarding";
import { ScalePressable } from "@/src/ui/ScalePressable";

function TabIcon({ name, color, size, locked, lockBg, lockFg }: { name: any; color: string; size: number; locked?: boolean; lockBg: string; lockFg: string }) {
  return (
    <View>
      <Ionicons name={name} size={size} color={color} />
      {locked && (
        <View style={[styles.lockBadge, { backgroundColor: lockBg }]}>
          <Ionicons name="lock-closed" size={11} color={lockFg} />
        </View>
      )}
    </View>
  );
}

function DeckButton({ children, style, ...props }: any) {
  return (
    <ScalePressable {...props} style={[style, styles.deckButton]} accessibilityRole="button">
      {children}
    </ScalePressable>
  );
}

function DeckBackground({ mode }: { mode: string }) {
  const colors = mode === "day"
    ? ["rgba(237,243,251,0.28)", "rgba(255,255,255,0.82)", "rgba(241,247,255,0.92)"]
    : mode === "dim"
      ? ["rgba(21,25,32,0.32)", "rgba(42,48,61,0.84)", "rgba(27,32,42,0.94)"]
      : ["rgba(7,10,16,0.28)", "rgba(22,28,39,0.84)", "rgba(9,13,21,0.94)"];
  return (
    <View style={styles.deckBackground} pointerEvents="none">
      <BlurView intensity={62} tint={mode === "day" ? "light" : "dark"} style={StyleSheet.absoluteFill} />
      <LinearGradient
        colors={colors as [string, string, ...string[]]}
        style={StyleSheet.absoluteFill}
      />
    </View>
  );
}

export default function TabsLayout() {
  const { resolution } = usePremium();
  // One gating contract decides the lock affordance too.
  const coachLocked = gate("coach", resolution) !== "allow";
  const exploreLocked = gate("explore", resolution) !== "allow";
  // The accessible name must never depend on an in-flight entitlement read: a
  // Premium surface is named Premium unless entitlement has RESOLVED with access,
  // so the name is identical on every launch.
  const tabName = (title: string, surface: Surface) =>
    isPremiumSurface(surface) && !resolution.access ? `${title}, Premium` : title;
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
      detachInactiveScreens
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: theme.accent,
        tabBarInactiveTintColor: theme.textMuted,
        tabBarHideOnKeyboard: true,
        lazy: true,
        freezeOnBlur: true,
        animation: "fade",
        tabBarButton: (props) => <DeckButton {...props} />,
        tabBarBackground: () => <DeckBackground mode={theme.mode} />,
        tabBarActiveBackgroundColor: theme.accent + "12",
        tabBarStyle: preOnboarding
          ? { display: "none" }
          : {
              backgroundColor: "transparent",
              borderTopColor: "transparent",
              borderTopWidth: 0,
              height: Platform.OS === "ios" ? 80 : 66,
              marginHorizontal: 0,
              marginBottom: 0,
              paddingTop: 7,
              paddingBottom: Platform.OS === "ios" ? 19 : 6,
              borderRadius: 0,
              overflow: "hidden",
              elevation: 0,
            },
        tabBarItemStyle: { borderRadius: 22, marginHorizontal: 2, marginVertical: 3 },
        tabBarLabelStyle: { fontSize: 10, fontWeight: "700", letterSpacing: 0.15 },
        sceneStyle: { backgroundColor: theme.bg },
      }}
    >
      <Tabs.Screen
        name="plan"
        options={{
          title: "Plan",
          tabBarAccessibilityLabel: tabName("Plan", "plan"),
          tabBarIcon: ({ color, size }) => <TabIcon name="calendar-outline" size={size} color={color} lockBg={theme.accent} lockFg={theme.ctaText} />,
        }}
      />
      <Tabs.Screen
        name="workout"
        options={{
          title: "Workout",
          tabBarAccessibilityLabel: tabName("Workout", "workout.session"),
          tabBarIcon: ({ color, size }) => <TabIcon name="barbell-outline" size={size} color={color} lockBg={theme.accent} lockFg={theme.ctaText} />,
        }}
      />
      <Tabs.Screen
        name="coach"
        options={{
          title: "Coach",
          // The lock is never icon-only: the accessible name says "Premium".
          tabBarAccessibilityLabel: tabName("Coach", "coach"),
          tabBarIcon: ({ color, size }) => <TabIcon name="sparkles-outline" size={size} color={color} locked={coachLocked} lockBg={theme.accent} lockFg={theme.ctaText} />,
        }}
      />
      <Tabs.Screen
        name="explore"
        options={{
          title: "Explore",
          tabBarAccessibilityLabel: tabName("Explore", "explore"),
          tabBarIcon: ({ color, size }) => <TabIcon name="cube-outline" size={size} color={color} locked={exploreLocked} lockBg={theme.accent} lockFg={theme.ctaText} />,
        }}
      />
      <Tabs.Screen
        name="library"
        options={{
          title: "Library",
          tabBarAccessibilityLabel: tabName("Library", "library.exercises"),
          tabBarIcon: ({ color, size }) => <TabIcon name="library-outline" size={size} color={color} lockBg={theme.accent} lockFg={theme.ctaText} />,
        }}
      />
      <Tabs.Screen name="learn" options={{ href: null }} />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  deckButton: { flex: 1, minHeight: 48 },
  deckBackground: {
    ...StyleSheet.absoluteFillObject,
    overflow: "hidden",
    borderTopWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(120,130,150,0.18)",
  },
  lockBadge: {
    position: "absolute",
    top: -5,
    right: -9,
    width: 17,
    height: 17,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
  },
});
