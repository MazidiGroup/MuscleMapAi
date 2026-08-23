import React, { useMemo } from "react";
import { View, Text, StyleSheet, ScrollView, Linking } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";

import { legacyPalette, LegacyPalette } from "@/src/anatomy/ui";
import { LiquidTouchableOpacity as TouchableOpacity } from "@/src/ui/LiquidTouchableOpacity";
import { useTheme } from "@/src/theme/ThemeContext";

const SUPPORT_EMAIL = "info@mazidigroup.com";
const UPDATED = "July 2026";
const APPLE_EULA_URL = "https://www.apple.com/legal/internet-services/itunes/dev/stdeula/";

export default function TermsScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { T, styles } = useLegacyStyles();

  return (
    <View style={styles.root}>
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <TouchableOpacity style={styles.back} onPress={() => router.back()} testID="terms-back">
          <Ionicons name="chevron-back" size={24} color={T.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Terms of Use</Text>
        <View style={styles.backPlaceholder} />
      </View>

      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: insets.bottom + 40 }} showsVerticalScrollIndicator={false}>
        <Text style={styles.updated}>Last updated: {UPDATED}</Text>

        <Section title="Acceptance">
          By downloading, installing or using Muscle Map Ai (the app), you agree to be bound by these
          Terms of Use (Terms) and by Apple&apos;s Standard End User License Agreement (EULA) which applies
          to all apps distributed through the Apple App Store.
        </Section>

        <TouchableOpacity style={styles.linkButton} onPress={() => Linking.openURL(APPLE_EULA_URL)} testID="terms-apple-eula">
          <Text style={styles.link}>Read Apple&apos;s Standard EULA →</Text>
        </TouchableOpacity>

        <Section title="License">
          We grant you a limited, non-exclusive, non-transferable, revocable licence to install and use
          the app on any Apple-branded product that you own or control, solely for personal,
          non-commercial use, subject to these Terms.
        </Section>

        <Section title="Subscriptions and Auto-Renewal">
          Muscle Map Ai offers auto-renewing subscriptions (Premium) that unlock the AI Coach,
          Learn lessons, recovery insights and other premium features. Subscription titles, lengths
          and prices are displayed on the in-app paywall before purchase and match the products
          published on the App Store.{"\n\n"}
          Payment is charged to your Apple ID at confirmation of purchase. Subscriptions automatically
          renew for the same period unless auto-renew is turned off at least 24 hours before the end
          of the current period. Your account is charged for renewal within 24 hours prior to the end
          of the current period at the same price, unless the plan has changed. You can manage your
          subscription and turn off auto-renewal in your Apple ID Account Settings after purchase.
          No cancellation of the current subscription is allowed during the active subscription period.
        </Section>

        <Section title="Educational Content — No Medical Advice">
          The app provides general anatomy education and fitness information for adults. It is NOT a
          medical device, does not provide medical diagnoses and is not a substitute for advice from a
          licensed physician, physiotherapist or other qualified health professional. Consult a
          professional before starting any new exercise programme, especially if you have injuries or
          medical conditions.
        </Section>

        <Section title="AI Coach">
          The AI Coach generates responses using a third-party large-language model. Answers may be
          inaccurate, incomplete or out of date and should be verified with a professional before use.
          Do not send confidential or medically sensitive information to the AI Coach.
        </Section>

        <Section title="Account and Data">
          You may use the app as a guest or create an account with email, Apple or Google sign-in. You
          are responsible for keeping your login method secure. You may delete your account at any
          time from Library → Account → Delete Account; this permanently removes your account and
          associated server-side data.
        </Section>

        <Section title="Acceptable Use">
          Do not misuse the app: no reverse-engineering, no attempts to circumvent subscription checks,
          no automated scraping of endpoints, no unlawful use. We may suspend accounts that violate
          these Terms.
        </Section>

        <Section title="Disclaimer of Warranties">
          The app is provided as is and as available without warranties of any kind, whether
          express, implied or statutory, to the maximum extent permitted by law.
        </Section>

        <Section title="Limitation of Liability">
          To the maximum extent permitted by law, Muscle Map Ai and its publisher are not liable for
          any indirect, incidental, special, consequential or punitive damages arising out of or in
          connection with your use of the app.
        </Section>

        <Section title="Changes">
          We may update these Terms from time to time. Material changes will be reflected by updating
          the date at the top of this page. Continued use after changes means you accept them.
        </Section>

        <Text style={styles.h2}>Contact</Text>
        <Text style={styles.p}>Questions about these Terms:</Text>
        <TouchableOpacity style={styles.linkButton} onPress={() => Linking.openURL(`mailto:${SUPPORT_EMAIL}`)} testID="terms-email">
          <Text style={styles.link}>{SUPPORT_EMAIL}</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  const { styles } = useLegacyStyles();
  return (
    <View style={{ marginTop: 8 }}>
      <Text style={styles.h2}>{title}</Text>
      <Text style={styles.p}>{children}</Text>
    </View>
  );
}

function useLegacyStyles() {
  const { mode } = useTheme();
  const T = useMemo(() => legacyPalette(mode), [mode]);
  const styles = useMemo(() => makeStyles(T), [T]);
  return { T, styles };
}

const makeStyles = (T: LegacyPalette) => StyleSheet.create({
  root: { flex: 1, backgroundColor: T.bg },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 12,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: T.border,
  },
  back: { width: 40, height: 40, borderRadius: 22, borderWidth: 1, borderColor: T.border, backgroundColor: T.surface, alignItems: "center", justifyContent: "center" },
  backPlaceholder: { width: 40, height: 40 },
  headerTitle: { color: T.text, fontSize: 17, fontWeight: "800" },
  updated: { color: T.textFaint, fontSize: 12, marginBottom: 14 },
  h2: { color: T.text, fontSize: 16, fontWeight: "800", marginTop: 18, marginBottom: 6 },
  p: { color: T.textDim, fontSize: 14, lineHeight: 22 },
  link: { color: T.accent, fontSize: 15, fontWeight: "700", marginTop: 6 },
  linkButton: { minHeight: 44, alignSelf: "flex-start", justifyContent: "center", paddingHorizontal: 14, borderRadius: 999, borderWidth: 1, borderColor: T.border, backgroundColor: T.surface },
});
