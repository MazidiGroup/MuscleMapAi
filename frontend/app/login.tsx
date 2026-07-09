import React, { useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  Image,
  Platform,
  ActivityIndicator,
  KeyboardAvoidingView,
  ScrollView,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";

import { useAuth } from "@/src/auth/AuthContext";
import { T } from "@/src/anatomy/ui";

type Step = "buttons" | "email" | "code";

export default function LoginScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user, loginWithGoogle, loginWithApple, requestMagicLink, verifyMagicCode, continueAsGuest } = useAuth();

  const [step, setStep] = useState<Step>("buttons");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [devCode, setDevCode] = useState<string | undefined>();
  const [busy, setBusy] = useState<string | null>(null); // 'google' | 'apple' | 'email' | 'verify'
  const [error, setError] = useState<string | null>(null);
  const codeInput = useRef<TextInput>(null);

  useEffect(() => {
    if (step === "code") setTimeout(() => codeInput.current?.focus(), 300);
  }, [step]);

  const run = async (key: string, fn: () => Promise<{ ok: boolean; cancelled?: boolean; error?: string }>) => {
    setError(null);
    setBusy(key);
    try {
      const res = await fn();
      if (!res.ok && !res.cancelled && res.error) setError(res.error);
    } finally {
      setBusy(null);
    }
  };

  const sendCode = async () => {
    setError(null);
    setBusy("email");
    try {
      const res = await requestMagicLink(email.trim());
      if (res.ok) {
        setDevCode(res.devCode);
        setCode("");
        setStep("code");
      } else if (res.error) {
        setError(res.error);
      }
    } finally {
      setBusy(null);
    }
  };

  const verify = () => run("verify", () => verifyMagicCode(email.trim(), code.trim()));

  const guest = async () => {
    setError(null);
    setBusy("guest");
    try {
      const res = await continueAsGuest();
      if (res.ok) router.replace("/(tabs)/explore");
      else if (res.error) setError(res.error);
    } finally {
      setBusy(null);
    }
  };

  return (
    <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingTop: insets.top + 48, paddingBottom: insets.bottom + 24 }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Brand */}
        <View style={styles.brand}>
          <View style={styles.logoWrap}>
            <Image source={require("../assets/images/icon.png")} style={styles.logo} />
          </View>
          <Text style={styles.appName}>Muscle Map Ai</Text>
          <Text style={styles.tagline}>Learn the body. Train it smarter.</Text>
        </View>

        {error && (
          <View style={styles.errorBox} testID="login-error">
            <Ionicons name="alert-circle" size={16} color="#EF4444" />
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}

        {step === "buttons" && (
          <View style={styles.buttons}>
            {Platform.OS === "ios" && (
              <TouchableOpacity
                style={[styles.btn, styles.btnApple]}
                onPress={() => run("apple", loginWithApple)}
                disabled={!!busy}
                testID="login-apple"
              >
                {busy === "apple" ? (
                  <ActivityIndicator color="#000" />
                ) : (
                  <>
                    <Ionicons name="logo-apple" size={20} color="#000" />
                    <Text style={styles.btnAppleText}>Continue with Apple</Text>
                  </>
                )}
              </TouchableOpacity>
            )}

            <TouchableOpacity
              style={[styles.btn, styles.btnGoogle]}
              onPress={() => run("google", loginWithGoogle)}
              disabled={!!busy}
              testID="login-google"
            >
              {busy === "google" ? (
                <ActivityIndicator color="#000" />
              ) : (
                <>
                  <Ionicons name="logo-google" size={18} color="#000" />
                  <Text style={styles.btnGoogleText}>Continue with Google</Text>
                </>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.btn, styles.btnEmail]}
              onPress={() => {
                setError(null);
                setStep("email");
              }}
              disabled={!!busy}
              testID="login-email"
            >
              <Ionicons name="mail-outline" size={18} color={T.text} />
              <Text style={styles.btnEmailText}>Continue with email</Text>
            </TouchableOpacity>

            {user?.is_guest ? (
              <TouchableOpacity
                style={styles.guestLink}
                onPress={() => router.replace("/(tabs)/explore")}
                testID="login-guest-back"
              >
                <Text style={styles.guestLinkText}>Not now — keep browsing as guest</Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity style={styles.guestLink} onPress={guest} disabled={!!busy} testID="login-guest">
                {busy === "guest" ? (
                  <ActivityIndicator color={T.textDim} size="small" />
                ) : (
                  <Text style={styles.guestLinkText}>Continue without an account</Text>
                )}
              </TouchableOpacity>
            )}
          </View>
        )}

        {step === "email" && (
          <View style={styles.buttons}>
            <Text style={styles.stepLabel}>We&apos;ll email you a one-time sign-in code.</Text>
            <TextInput
              style={styles.input}
              placeholder="you@example.com"
              placeholderTextColor={T.textFaint}
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="email-address"
              autoFocus
              testID="login-email-input"
            />
            <TouchableOpacity
              style={[styles.btn, styles.btnPrimary, !email.includes("@") && styles.btnDisabled]}
              onPress={sendCode}
              disabled={!!busy || !email.includes("@")}
              testID="login-send-code"
            >
              {busy === "email" ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.btnPrimaryText}>Send sign-in code</Text>
              )}
            </TouchableOpacity>
            <TouchableOpacity style={styles.backLink} onPress={() => { setError(null); setStep("buttons"); }} testID="login-back">
              <Text style={styles.backLinkText}>← Other sign-in options</Text>
            </TouchableOpacity>
          </View>
        )}

        {step === "code" && (
          <View style={styles.buttons}>
            <Text style={styles.stepLabel}>
              Enter the 6-digit code we sent to{"\n"}
              <Text style={{ color: T.text, fontWeight: "700" }}>{email.trim()}</Text>
            </Text>
            {devCode && (
              <View style={styles.devCodeBox} testID="login-dev-code">
                <Text style={styles.devCodeText}>Dev mode (email not configured) — your code: {devCode}</Text>
              </View>
            )}
            <TextInput
              ref={codeInput}
              style={[styles.input, styles.codeInput]}
              placeholder="······"
              placeholderTextColor={T.textFaint}
              value={code}
              onChangeText={(t) => setCode(t.replace(/[^0-9]/g, "").slice(0, 6))}
              keyboardType="number-pad"
              maxLength={6}
              testID="login-code-input"
            />
            <TouchableOpacity
              style={[styles.btn, styles.btnPrimary, code.length !== 6 && styles.btnDisabled]}
              onPress={verify}
              disabled={!!busy || code.length !== 6}
              testID="login-verify"
            >
              {busy === "verify" ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.btnPrimaryText}>Sign in</Text>
              )}
            </TouchableOpacity>
            <TouchableOpacity style={styles.backLink} onPress={sendCode} disabled={!!busy} testID="login-resend">
              <Text style={styles.backLinkText}>Resend code</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.backLink} onPress={() => { setError(null); setStep("email"); }}>
              <Text style={styles.backLinkText}>← Use a different email</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Terms */}
        <Text style={styles.terms}>
          By continuing you agree to our{" "}
          <Text style={styles.termsLink} onPress={() => router.push("/terms")}>
            Terms
          </Text>
          {" & "}
          <Text style={styles.termsLink} onPress={() => router.push("/privacy")}>
            Privacy Policy
          </Text>
        </Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: T.bg },
  scroll: { flexGrow: 1, paddingHorizontal: 28, justifyContent: "space-between" },
  brand: { alignItems: "center", marginTop: 24 },
  logoWrap: {
    width: 88,
    height: 88,
    borderRadius: 22,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: T.border,
    backgroundColor: T.surface,
  },
  logo: { width: 88, height: 88 },
  appName: { color: T.text, fontSize: 28, fontWeight: "800", marginTop: 18, letterSpacing: 0.3 },
  tagline: { color: T.textDim, fontSize: 15, marginTop: 6 },
  errorBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "rgba(239,68,68,0.12)",
    borderWidth: 1,
    borderColor: "rgba(239,68,68,0.35)",
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 11,
    marginTop: 20,
  },
  errorText: { flex: 1, color: "#FCA5A5", fontSize: 13, lineHeight: 18 },
  buttons: { gap: 12, marginVertical: 32 },
  btn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    height: 52,
    borderRadius: 999,
  },
  btnApple: { backgroundColor: "#FFFFFF" },
  btnAppleText: { color: "#000", fontSize: 16, fontWeight: "700" },
  btnGoogle: { backgroundColor: "#FFFFFF" },
  btnGoogleText: { color: "#000", fontSize: 16, fontWeight: "700" },
  btnEmail: { backgroundColor: T.surface, borderWidth: 1, borderColor: T.border },
  btnEmailText: { color: T.text, fontSize: 16, fontWeight: "700" },
  btnPrimary: { backgroundColor: "#0A84FF" },
  btnPrimaryText: { color: "#fff", fontSize: 16, fontWeight: "700" },
  btnDisabled: { opacity: 0.4 },
  stepLabel: { color: T.textDim, fontSize: 14, lineHeight: 21, textAlign: "center", marginBottom: 4 },
  input: {
    backgroundColor: T.surface,
    borderWidth: 1,
    borderColor: T.border,
    borderRadius: 14,
    height: 52,
    paddingHorizontal: 16,
    color: T.text,
    fontSize: 16,
  },
  codeInput: { textAlign: "center", fontSize: 24, letterSpacing: 12, fontWeight: "700" },
  devCodeBox: {
    backgroundColor: "rgba(10,132,255,0.12)",
    borderWidth: 1,
    borderColor: "rgba(10,132,255,0.35)",
    borderRadius: 12,
    padding: 12,
  },
  devCodeText: { color: "#7CB8FF", fontSize: 13, textAlign: "center" },
  backLink: { alignItems: "center", paddingVertical: 6 },
  backLinkText: { color: T.textDim, fontSize: 14, fontWeight: "600" },
  guestLink: { alignItems: "center", paddingVertical: 12, minHeight: 44, justifyContent: "center" },
  guestLinkText: { color: T.textDim, fontSize: 15, fontWeight: "600", textDecorationLine: "underline" },
  terms: { color: T.textFaint, fontSize: 12, textAlign: "center", lineHeight: 18 },
  termsLink: { color: T.textDim, textDecorationLine: "underline" },
});
