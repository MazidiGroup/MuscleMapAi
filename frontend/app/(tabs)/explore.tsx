import React, { useEffect, useMemo, useRef, useState } from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";

import { AnatomyViewer, ViewerHandle } from "@/src/anatomy/AnatomyViewer";
import { MuscleSheet } from "@/src/anatomy/MuscleSheet";
import { DraggableSheet, DraggableSheetHandle } from "@/src/anatomy/DraggableSheet";
import { EXPLORER } from "@/src/anatomy/groups";
import { legacyPalette, LegacyPalette } from "@/src/anatomy/ui";
import { useTheme } from "@/src/theme/ThemeContext";
import { ThemeToggle } from "@/src/theme/ThemeToggle";
import { usePremium } from "@/src/premium/PremiumContext";
import { Paywall } from "@/src/premium/Paywall";

export default function ExploreScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { height } = useWindowDimensions();
  const { mode } = useTheme();
  const { isPremium } = usePremium();
  const T = useMemo(() => legacyPalette(mode), [mode]);
  const styles = useMemo(() => makeStyles(T), [T]);
  const viewer = useRef<ViewerHandle>(null);
  const sheet = useRef<DraggableSheetHandle>(null);

  const [selected, setSelected] = useState<string | null>(null);
  const [isolate, setIsolate] = useState<string | null>(null);
  const [hidden, setHidden] = useState<string[]>([]);

  const peek = 158;
  const maxHeight = Math.min(height * 0.86, height - insets.top - 64);

  // expand the sheet when a muscle is tapped, collapse when cleared
  useEffect(() => {
    if (selected) sheet.current?.snapTo("expanded");
    else sheet.current?.snapTo("collapsed");
  }, [selected]);

  const toggleHidden = (container: string) =>
    setHidden((h) => (h.includes(container) ? h.filter((c) => c !== container) : [...h, container]));

  const focusCategory = (container: string) => {
    setSelected(null);
    setIsolate((cur) => (cur === container ? null : container));
  };

  const showAll = () => {
    setIsolate(null);
    setHidden([]);
    setSelected(null);
    viewer.current?.resetView();
  };

  if (!isPremium) {
    return (
      <View style={{ flex: 1, backgroundColor: T.bg }}>
        <Paywall title="Unlock 3D Explore" />
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <AnatomyViewer
        ref={viewer}
        mode="explore"
        hidden={hidden}
        isolate={isolate}
        onSelect={(name) => setSelected(name)}
      />

      <View style={[styles.header, { paddingTop: insets.top + 8, pointerEvents: "box-none" }]}>
        <View style={{ flex: 1 }}>
          <Text style={[styles.h1, { color: "#EAF1FB" }]}>Explore Anatomy</Text>
          <Text style={[styles.sub, { color: "#9AA7BD" }]}>Tap a muscle to learn about it · drag to rotate</Text>
        </View>
        <ThemeToggle />
      </View>

      <DraggableSheet ref={sheet} peekHeight={peek} maxHeight={maxHeight} initial="collapsed">
        {selected ? (
          <MuscleSheet
            nodeName={selected}
            showHandle={false}
            fill
            onClose={() => {
              setSelected(null);
              viewer.current?.resetView();
            }}
            onExercise={(id) => router.push({ pathname: "/(tabs)/workout", params: { ex: id } })}
          />
        ) : (
          <View style={styles.controls}>
            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 16 }}>
                {EXPLORER.map((section) => {
                  const sysHidden = hidden.includes(section.container);
                  return (
                    <View key={section.key} style={{ marginBottom: 8 }}>
                      <View style={styles.sectionHead}>
                        <Text style={styles.sectionTitle}>{section.label}</Text>
                        <TouchableOpacity onPress={() => toggleHidden(section.container)} style={styles.eyeBtn} testID={`toggle-${section.key}`}>
                          <Ionicons name={sysHidden ? "eye-off-outline" : "eye-outline"} size={18} color={sysHidden ? T.textFaint : T.accent} />
                        </TouchableOpacity>
                      </View>
                      <View style={styles.chipWrap}>
                        {section.children.map((c) => {
                          const active = isolate === c.container;
                          const chHidden = hidden.includes(c.container);
                          return (
                            <TouchableOpacity
                              key={c.key}
                              style={[styles.chip, active && styles.chipActive, chHidden && styles.chipHidden]}
                              onPress={() => focusCategory(c.container)}
                              onLongPress={() => toggleHidden(c.container)}
                              testID={`cat-${c.key}`}
                            >
                              <Ionicons name={c.icon as any} size={15} color={active ? T.bg : chHidden ? T.textFaint : T.accent} />
                              <Text style={[styles.chipText, active && styles.chipTextActive, chHidden && { color: T.textFaint }]}>{c.label}</Text>
                            </TouchableOpacity>
                          );
                        })}
                      </View>
                    </View>
                  );
                })}
                <Text style={styles.hint}>Tap a region to isolate it · long-press to hide</Text>
                <TouchableOpacity style={styles.showAll} onPress={showAll} testID="show-all-btn">
                  <Ionicons name="scan-outline" size={16} color={T.text} />
                  <Text style={styles.showAllText}>Show Full Body</Text>
                </TouchableOpacity>
              </ScrollView>
          </View>
        )}
      </DraggableSheet>
    </View>
  );
}

function SegBtn({ label, active, onPress, icon, styles, T }: { label: string; active: boolean; onPress: () => void; icon: any; styles: any; T: LegacyPalette }) {
  return (
    <TouchableOpacity style={[styles.segBtn, active && styles.segBtnActive]} onPress={onPress}>
      <Ionicons name={icon} size={15} color={active ? T.bg : T.textDim} />
      <Text style={[styles.segText, active && styles.segTextActive]}>{label}</Text>
    </TouchableOpacity>
  );
}

const makeStyles = (T: LegacyPalette) => StyleSheet.create({
  root: { flex: 1, backgroundColor: T.bg },
  header: { position: "absolute", top: 0, left: 0, right: 0, paddingHorizontal: 18, flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 12 },
  h1: { color: T.text, fontSize: 22, fontWeight: "800" },
  sub: { color: T.textDim, fontSize: 13, marginTop: 2 },
  controls: { flex: 1, paddingHorizontal: 16, paddingTop: 2 },
  segment: { flexDirection: "row", backgroundColor: T.bg2, borderRadius: 12, padding: 4, marginBottom: 12, gap: 4 },
  segBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 9, borderRadius: 9 },
  segBtnActive: { backgroundColor: T.accent },
  segText: { color: T.textDim, fontSize: 13, fontWeight: "700" },
  segTextActive: { color: T.bg },
  sectionHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 8 },
  sectionTitle: { color: T.textDim, fontSize: 12, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.5 },
  eyeBtn: { padding: 4 },
  chipWrap: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: T.surfaceHi, borderWidth: 1, borderColor: T.border, paddingHorizontal: 12, paddingVertical: 9, borderRadius: 999 },
  chipActive: { backgroundColor: T.accent, borderColor: T.accent },
  chipHidden: { opacity: 0.5 },
  chipText: { color: T.text, fontSize: 13, fontWeight: "600" },
  chipTextActive: { color: T.bg, fontWeight: "700" },
  hint: { color: T.textFaint, fontSize: 12, marginTop: 8, marginBottom: 4 },
  shrinkHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 6 },
  shrinkTitle: { color: T.text, fontSize: 16, fontWeight: "700" },
  shrinkPct: { color: T.accent, fontSize: 16, fontWeight: "800" },
  shrinkBtns: { flexDirection: "row", gap: 8, marginTop: 10 },
  smallBtn: { flex: 1, backgroundColor: T.surfaceHi, borderWidth: 1, borderColor: T.border, paddingVertical: 10, borderRadius: 10, alignItems: "center" },
  smallBtnText: { color: T.text, fontSize: 13, fontWeight: "600" },
  showAll: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: T.bg2, borderWidth: 1, borderColor: T.borderHi, paddingVertical: 12, borderRadius: 12, marginTop: 12 },
  showAllText: { color: T.text, fontSize: 14, fontWeight: "700" },
});
