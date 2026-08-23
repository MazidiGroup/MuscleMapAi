import React, { useMemo } from "react";
import { View, Text, StyleSheet, ScrollView, Linking } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";

import { legacyPalette, LegacyPalette } from "@/src/anatomy/ui";
import { LiquidTouchableOpacity as TouchableOpacity } from "@/src/ui/LiquidTouchableOpacity";
import { useTheme } from "@/src/theme/ThemeContext";

const SUPPORT_EMAIL = "info@mazidigroup.com";
const UPDATED = "June 2026";

export default function PrivacyScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { T, styles } = useLegacyStyles();

  return (
    <View style={styles.root}>
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <TouchableOpacity style={styles.back} onPress={() => router.back()} testID="privacy-back">
          <Ionicons name="chevron-back" size={24} color={T.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Privacy Policy</Text>
        <View style={styles.backPlaceholder} />
      </View>

      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: insets.bottom + 40 }} showsVerticalScrollIndicator={false}>
        <Text style={styles.updated}>Last updated: {UPDATED}</Text>

        <Text style={styles.p}>
          Muscle Map (the app) respects your privacy. This policy explains what data the app handles and how it is
          used. We designed the app to keep your personal data on your device wherever possible.
        </Text>

        <Section title="Data stored on your device">
          Your workouts, sets, reps, training history, bookmarks and preferences are stored locally on your device only.
          This data is not transmitted to us and is removed when you uninstall the app or clear its data.
        </Section>

        <Section title="AI Coach">
          When you send a message to the AI Coach, the text you type is transmitted over a secure connection to our backend
          and forwarded to a third-party AI provider to generate a response. These messages are used solely to produce your
          reply. We do not use them to build advertising profiles, and we do not sell them.
        </Section>

        <Section title="Information we do not collect">
          The app does not require an account to use. It does not access your camera, microphone, location, contacts, photos,
          or health data, and it contains no third-party advertising or tracking SDKs.
        </Section>

        <Section title="Data security">
          Network requests to our backend use encrypted HTTPS connections. While no method of transmission is completely
          secure, we take reasonable measures to protect information in transit.
        </Section>

        <Section title="Children's privacy">
          The app is intended for a general fitness and educational audience and is not directed at children under 13. We do
          not knowingly collect personal information from children.
        </Section>

        <Section title="Changes to this policy">
          We may update this policy from time to time. Material changes will be reflected by updating the date at the top of
          this page.
        </Section>

        <Text style={styles.h2}>Contact</Text>
        <Text style={styles.p}>
          If you have questions about this policy or your data, contact us:
        </Text>
        <TouchableOpacity style={styles.linkButton} onPress={() => Linking.openURL(`mailto:${SUPPORT_EMAIL}`)} testID="privacy-email">
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
