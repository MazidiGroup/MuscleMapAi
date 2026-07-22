import { Tabs } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { Platform, View, StyleSheet } from "react-native";

import { T } from "@/src/anatomy/ui";
import { usePremium } from "@/src/premium/PremiumContext";
import { useTheme } from "@/src/theme/ThemeContext";

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
  const { isPremium } = usePremium();
  const locked = !isPremium;
  const { T: theme } = useTheme();

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: theme.accent,
        tabBarInactiveTintColor: theme.textMuted,
        tabBarStyle: {
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
        options={{ title: "Coach", tabBarIcon: ({ color, size }) => <TabIcon name="sparkles-outline" size={size} color={color} locked={locked} /> }}
      />
      <Tabs.Screen
        name="explore"
        options={{ title: "Explore", tabBarIcon: ({ color, size }) => <TabIcon name="cube-outline" size={size} color={color} locked={locked} /> }}
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
