import { useEffect } from "react";
import { View, ActivityIndicator, StyleSheet } from "react-native";
import { useRouter } from "expo-router";

import { useAuth } from "@/src/auth-context";
import { COLORS } from "@/src/theme";

export default function Index() {
  const router = useRouter();
  const { user, loading } = useAuth();

  useEffect(() => {
    if (loading) return;
    if (!user) {
      router.replace("/login");
    } else if (!user.onboarded) {
      router.replace("/onboarding");
    } else {
      router.replace("/(tabs)");
    }
  }, [user, loading, router]);

  return (
    <View style={styles.container} testID="splash-screen">
      <ActivityIndicator color={COLORS.primary} size="large" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg, alignItems: "center", justifyContent: "center" },
});
