import React from "react";
import { View, Text, StyleSheet, ScrollView } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";

import { T } from "@/src/anatomy/ui";

export default function SettingsScreen() {
  const insets = useSafeAreaInsets();

  return (
    <View style={styles.root}>
      <ScrollView contentContainerStyle={{ paddingTop: insets.top + 12, paddingHorizontal: 18, paddingBottom: 40 }}>
        <Text style={styles.h1}>Settings</Text>
        <Text style={styles.sub}>Fitness Anatomy Trainer</Text>

        <View style={styles.hero}>
          <Ionicons name="body-outline" size={40} color={T.accent} />
          <Text style={styles.heroTitle}>Ecorché Anatomy Model</Text>
          <Text style={styles.heroText}>
            A real-scale (180 cm) human écorché with the full skeleton and every major muscle as an individually
            selectable structure, plus morph-target muscle atrophy.
          </Text>
        </View>

        <Section title="About">
          <Row icon="cube-outline" label="Anatomical structures" value="270 named parts" />
          <Row icon="color-palette-outline" label="Rendering" value="Programmatic (engine-coloured)" />
          <Row icon="contract-outline" label="Shrunken View" value="79 morph targets" />
          <Row icon="phone-portrait-outline" label="Platforms" value="iOS · Android · Web" />
        </Section>

        <Section title="How to use">
          <Tip text="Drag to rotate · pinch or use +/− to zoom" />
          <Tip text="Tap any muscle to identify it and read its function, origin & insertion" />
          <Tip text="Open Layers to isolate a body region or hide a system" />
          <Tip text="Use Workout Mode to see which muscles an exercise trains" />
        </Section>

        <Text style={styles.footer}>Anatomy Trainer · v1.0</Text>
      </ScrollView>
    </View>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={{ marginTop: 22 }}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <View style={styles.card}>{children}</View>
    </View>
  );
}

function Row({ icon, label, value }: { icon: any; label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Ionicons name={icon} size={18} color={T.accent} />
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue}>{value}</Text>
    </View>
  );
}

function Tip({ text }: { text: string }) {
  return (
    <View style={styles.tip}>
      <Ionicons name="checkmark-circle" size={16} color={T.accent} />
      <Text style={styles.tipText}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: T.bg },
  h1: { color: T.text, fontSize: 26, fontWeight: "800" },
  sub: { color: T.textDim, fontSize: 13, marginTop: 2 },
  hero: {
    backgroundColor: T.surface,
    borderWidth: 1,
    borderColor: T.border,
    borderRadius: 18,
    padding: 20,
    alignItems: "center",
    marginTop: 18,
    gap: 8,
  },
  heroTitle: { color: T.text, fontSize: 18, fontWeight: "800" },
  heroText: { color: T.textDim, fontSize: 13, lineHeight: 20, textAlign: "center" },
  sectionTitle: { color: T.textDim, fontSize: 12, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8 },
  card: { backgroundColor: T.surface, borderWidth: 1, borderColor: T.border, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 4 },
  row: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: T.border },
  rowLabel: { color: T.text, fontSize: 14, flex: 1 },
  rowValue: { color: T.textDim, fontSize: 13, fontWeight: "600" },
  tip: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 10 },
  tipText: { color: T.text, fontSize: 14, flex: 1 },
  footer: { color: T.textFaint, fontSize: 12, textAlign: "center", marginTop: 28 },
});
