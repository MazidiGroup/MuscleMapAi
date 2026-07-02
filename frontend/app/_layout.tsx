import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { useEffect } from "react";
import { LogBox, StatusBar, Platform } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { GestureHandlerRootView } from "react-native-gesture-handler";

import { useIconFonts } from "@/src/hooks/use-icon-fonts";
import { WorkoutProvider } from "@/src/anatomy/workoutStore";
import { PremiumProvider } from "@/src/premium/PremiumContext";

LogBox.ignoreAllLogs(true);
SplashScreen.preventAutoHideAsync();

// Configure RevenueCat once, at module load (before any component mounts), so the
// SDK is ready before PremiumProvider reads CustomerInfo. Native + iOS only for now
// (no Android key yet); the SDK is not available on web/Expo Go.
if (Platform.OS === "ios") {
  const Purchases = require("react-native-purchases").default;
  const { LOG_LEVEL } = require("react-native-purchases");
  const apiKey = process.env.EXPO_PUBLIC_REVENUECAT_IOS_KEY;
  if (apiKey) {
    try {
      Purchases.setLogLevel(LOG_LEVEL.INFO);
      Purchases.configure({ apiKey });
    } catch (e) {
      console.warn("[premium] RevenueCat configure failed", e);
    }
  }
}

export default function RootLayout() {
  const [loaded, error] = useIconFonts();

  useEffect(() => {
    if (loaded || error) SplashScreen.hideAsync();
  }, [loaded, error]);

  if (!loaded && !error) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: "#070A0F" }}>
      <SafeAreaProvider>
        <StatusBar barStyle="light-content" />
        <WorkoutProvider>
          <PremiumProvider>
            <Stack
              screenOptions={{
                headerShown: false,
                contentStyle: { backgroundColor: "#070A0F" },
                animation: "fade",
              }}
            />
          </PremiumProvider>
        </WorkoutProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
