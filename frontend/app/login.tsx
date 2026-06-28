import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ActivityIndicator,
  TextInput,
  Platform,
  ImageBackground,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";

import { useAuth } from "@/src/auth-context";
import { COLORS, FONT, RADIUS, SPACING, IMAGES } from "@/src/theme";

export default function Login() {
  const { signInWithGoogle, signInAsDemo, refresh } = useAuth();
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [showEmail, setShowEmail] = useState(false);

  const onGoogle = async () => {
    setBusy(true);
    try {
      await signInWithGoogle();
    } catch (e) {
      console.warn(e);
    } finally {
      setBusy(false);
    }
  };

  const onContinueEmail = async () => {
    if (!email.includes("@")) return;
    setBusy(true);
    try {
      const { apiPost, setToken } = await import("@/src/api");
      const out = await apiPost<any>("/auth/email/login", { email });
      await setToken(out.session_token);
      await refresh();
    } catch (e) {
      console.warn(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <ImageBackground source={{ uri: IMAGES.hero }} style={styles.bg} blurRadius={Platform.OS === "ios" ? 12 : 6}>
      <LinearGradient
        colors={["rgba(10,10,10,0.55)", "rgba(10,10,10,0.92)", "#0A0A0A"]}
        style={StyleSheet.absoluteFill}
      />
      <SafeAreaView style={{ flex: 1 }} edges={["top", "bottom"]}>
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ flex: 1 }}>
          <View style={styles.container}>
            <View style={{ flex: 1 }} />
            <View style={styles.brand}>
              <View style={styles.logoDot} />
              <Text style={styles.brandText}>APEX</Text>
            </View>
            <Text style={styles.h1} testID="login-headline">
              Your AI strength{"\n"}coach.
            </Text>
            <Text style={styles.sub}>
              Personal training that learns you, adapts every week, and never misses a session.
            </Text>

            <View style={{ height: SPACING["3xl"] }} />

            {!showEmail ? (
              <>
                <Pressable
                  testID="apple-signin-button"
                  style={({ pressed }) => [styles.btn, styles.btnApple, pressed && styles.pressed]}
                  onPress={() => {
                    // Apple Sign-In requires native build; fall through to Google for V1 sandbox
                    onGoogle();
                  }}
                >
                  <Ionicons name="logo-apple" size={20} color="#000" />
                  <Text style={styles.btnAppleText}>Continue with Apple</Text>
                </Pressable>

                <Pressable
                  testID="google-signin-button"
                  style={({ pressed }) => [styles.btn, styles.btnGoogle, pressed && styles.pressed]}
                  onPress={onGoogle}
                >
                  <Ionicons name="logo-google" size={18} color="#FFF" />
                  <Text style={styles.btnGoogleText}>Continue with Google</Text>
                </Pressable>

                <Pressable
                  testID="email-signin-button"
                  style={({ pressed }) => [styles.btn, styles.btnGhost, pressed && styles.pressed]}
                  onPress={() => setShowEmail(true)}
                >
                  <Ionicons name="mail-outline" size={18} color={COLORS.text} />
                  <Text style={styles.btnGhostText}>Continue with email</Text>
                </Pressable>

                <Pressable testID="demo-signin-button" onPress={signInAsDemo} style={styles.demoLink}>
                  <Text style={styles.demoLinkText}>or try a demo account →</Text>
                </Pressable>
              </>
            ) : (
              <>
                <TextInput
                  testID="email-input"
                  value={email}
                  onChangeText={setEmail}
                  placeholder="you@email.com"
                  placeholderTextColor={COLORS.textTertiary}
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType="email-address"
                  style={styles.input}
                />
                <Pressable
                  testID="email-continue-button"
                  style={({ pressed }) => [styles.btn, styles.btnPrimary, pressed && styles.pressed]}
                  onPress={onContinueEmail}
                  disabled={busy || !email.includes("@")}
                >
                  {busy ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <Text style={styles.btnPrimaryText}>Continue →</Text>
                  )}
                </Pressable>
                <Pressable onPress={() => setShowEmail(false)} style={styles.demoLink}>
                  <Text style={styles.demoLinkText}>← back</Text>
                </Pressable>
              </>
            )}

            <Text style={styles.tos}>
              By continuing you agree to our Terms & Privacy.
            </Text>
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  bg: { flex: 1, backgroundColor: COLORS.bg },
  container: { paddingHorizontal: SPACING["2xl"], paddingBottom: SPACING["2xl"] },
  brand: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: SPACING.xl },
  logoDot: { width: 12, height: 12, borderRadius: 6, backgroundColor: COLORS.primary, shadowColor: COLORS.primary, shadowOpacity: 0.7, shadowRadius: 10 },
  brandText: { color: COLORS.text, fontSize: 14, fontWeight: "700", letterSpacing: 4 },
  h1: { color: COLORS.text, fontSize: 44, fontWeight: "700", lineHeight: 48, letterSpacing: -1 },
  sub: { color: COLORS.textSecondary, fontSize: 16, marginTop: SPACING.lg, lineHeight: 22, maxWidth: 320 },
  btn: { flexDirection: "row", gap: 10, alignItems: "center", justifyContent: "center", paddingVertical: 15, borderRadius: RADIUS.full, marginBottom: 10 },
  btnPrimary: { backgroundColor: COLORS.primary },
  btnPrimaryText: { color: "#fff", fontSize: FONT.size.md, fontWeight: "600" },
  btnApple: { backgroundColor: "#FFFFFF" },
  btnAppleText: { color: "#000", fontSize: FONT.size.md, fontWeight: "600" },
  btnGoogle: { backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border },
  btnGoogleText: { color: COLORS.text, fontSize: FONT.size.md, fontWeight: "600" },
  btnGhost: { backgroundColor: "transparent", borderWidth: 1, borderColor: COLORS.borderStrong },
  btnGhostText: { color: COLORS.text, fontSize: FONT.size.md, fontWeight: "600" },
  pressed: { opacity: 0.7, transform: [{ scale: 0.98 }] },
  input: { backgroundColor: COLORS.surfaceElevated, borderRadius: RADIUS.lg, paddingHorizontal: 16, paddingVertical: 16, color: COLORS.text, fontSize: 16, marginBottom: 10 },
  demoLink: { alignItems: "center", paddingVertical: 12 },
  demoLinkText: { color: COLORS.textSecondary, fontSize: 14 },
  tos: { color: COLORS.textTertiary, fontSize: 12, textAlign: "center", marginTop: 12 },
});
