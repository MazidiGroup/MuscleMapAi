import { Tabs } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { Platform } from "react-native";

import { T } from "@/src/anatomy/ui";

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: T.accent,
        tabBarInactiveTintColor: T.textFaint,
        tabBarStyle: {
          backgroundColor: "#0A0F18",
          borderTopColor: T.border,
          borderTopWidth: 1,
          height: Platform.OS === "ios" ? 86 : 64,
          paddingTop: 6,
          paddingBottom: Platform.OS === "ios" ? 28 : 8,
        },
        tabBarLabelStyle: { fontSize: 10, fontWeight: "600" },
      }}
    >
      <Tabs.Screen
        name="explore"
        options={{ title: "Explore", tabBarIcon: ({ color, size }) => <Ionicons name="cube-outline" size={size} color={color} /> }}
      />
      <Tabs.Screen
        name="workout"
        options={{ title: "Workout", tabBarIcon: ({ color, size }) => <Ionicons name="barbell-outline" size={size} color={color} /> }}
      />
      <Tabs.Screen
        name="learn"
        options={{ title: "Learn", tabBarIcon: ({ color, size }) => <Ionicons name="school-outline" size={size} color={color} /> }}
      />
      <Tabs.Screen
        name="coach"
        options={{ title: "Coach", tabBarIcon: ({ color, size }) => <Ionicons name="sparkles-outline" size={size} color={color} /> }}
      />
      <Tabs.Screen
        name="library"
        options={{ title: "Library", tabBarIcon: ({ color, size }) => <Ionicons name="library-outline" size={size} color={color} /> }}
      />
    </Tabs>
  );
}
