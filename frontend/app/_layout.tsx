import { Stack, useRouter, useSegments } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import React, { useEffect } from "react";
import { LogBox, StatusBar, Platform } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { GestureHandlerRootView } from "react-native-gesture-handler";

import { useIconFonts } from "@/src/hooks/use-icon-fonts";
import { WorkoutProvider } from "@/src/anatomy/workoutStore";
import { PremiumProvider } from "@/src/premium/PremiumContext";
import { AuthProvider, useAuth } from "@/src/auth/AuthContext";
import { OwnerProvider, useOwner } from "@/src/owner/OwnerContext";
import { ThemeProvider, useTheme } from "@/src/theme/ThemeContext";
import { LoadingScreen } from "@/src/theme/LoadingScreen";

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

// Gates every route behind auth: unauthenticated users only see /login (and /privacy).
// Deep links stay intact — they resolve normally once the user is signed in.
function AuthGate({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const segments = useSegments();
  const router = useRouter();

  // Reveal our branded (themed) loading screen as soon as JS is ready, instead
  // of sitting on the static native splash.
  useEffect(() => {
    SplashScreen.hideAsync().catch(() => {});
  }, []);

  useEffect(() => {
    if (loading) return;
    SplashScreen.hideAsync();
    const seg = segments[0] as string | undefined;
    const isPublic = seg === "login" || seg === "privacy" || seg === "terms" || seg === "references";
    if (!user && !isPublic) {
      router.replace("/login");
    } else if (user && !user.is_guest && seg === "login") {
      // Guests may visit /login to upgrade to a real account
      router.replace("/(tabs)/plan");
    }
  }, [user, loading, segments, router]);

  if (loading) return <LoadingScreen />;

  return <>{children}</>;
}

/**
 * Blocks rendering until the central owner resolver has settled. This is what
 * guarantees no owner-scoped read happens before resolution and that an account
 * switch never shows a frame of the previous owner's content.
 */
function OwnerGate({ children }: { children: React.ReactNode }) {
  const { ready } = useOwner();
  if (!ready) return <LoadingScreen />;
  return <>{children}</>;
}

function ThemedStack() {
  const { T, mode } = useTheme();
  return (
    <>
      <StatusBar barStyle={mode === "night" ? "light-content" : "dark-content"} />
      <AuthGate>
        <OwnerGate>
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: T.bg },
            animation: "fade",
          }}
        />
        </OwnerGate>
      </AuthGate>
    </>
  );
}

export default function RootLayout() {
  const [loaded, error] = useIconFonts();

  if (!loaded && !error) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: "#070A0F" }}>
      <SafeAreaProvider>
        <AuthProvider>
          <OwnerProvider>
            <WorkoutProvider>
              <PremiumProvider>
                <ThemeProvider>
                  <ThemedStack />
                </ThemeProvider>
              </PremiumProvider>
            </WorkoutProvider>
          </OwnerProvider>
        </AuthProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
