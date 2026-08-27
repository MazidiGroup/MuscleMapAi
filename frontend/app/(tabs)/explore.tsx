import React, { useEffect, useMemo, useRef, useState } from "react";
import { View, Text, StyleSheet, ScrollView, useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";

import { AnatomyViewer, ViewerHandle } from "@/src/anatomy/AnatomyViewer";
import { MuscleSheet } from "@/src/anatomy/MuscleSheet";
import { DraggableSheet, DraggableSheetHandle } from "@/src/anatomy/DraggableSheet";
import { EXPLORER } from "@/src/anatomy/groups";
import { legacyPalette, LegacyPalette } from "@/src/anatomy/ui";
import { useTheme } from "@/src/theme/ThemeContext";
import { PremiumGate } from "@/src/premium/PremiumGate";
import { LiquidTouchableOpacity as TouchableOpacity } from "@/src/ui/LiquidTouchableOpacity";

export default function ExploreScreen() {
  return (
    <PremiumGate surface="explore">
      <ExploreContent />
    </PremiumGate>
  );
}

function ExploreContent() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { height } = useWindowDimensions();
  const { mode } = useTheme();
  const T = useMemo(() => legacyPalette(mode), [mode]);
  const styles = useMemo(() => makeStyles(T), [T]);
  const viewer = useRef<ViewerHandle>(null);
  const sheet = useRef<DraggableSheetHandle>(null);

  const [selected, setSelected] = useState<string | null>(null);
  const [isolate, setIsolate] = useState<string | null>(null);
  const [system, setSystem] = useState<string>("muscular");
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
          <Text style={styles.h1}>Explore Anatomy</Text>
          <Text style={styles.sub}>Tap a muscle to learn about it · drag to rotate</Text>
        </View>
      </View>

      <DraggableSheet ref={sheet} peekHeight={peek} maxHeight={maxHeight} initial="collapsed">
        {selected ? (
          <MuscleSheet
            nodeName={selected}
            showHandle={false}
            fill
            variant="preview"
            onClose={() => {
              setSelected(null);
              viewer.current?.resetView();
            }}
            onExercise={(id) => router.push({ pathname: "/(tabs)/workout", params: { ex: id } })}
          />
        ) : (
          <View style={styles.controls}>
            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 16 }}>
              <View style={styles.panelHead}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.panelTitle}>Body layers</Text>
                  <Text style={styles.panelSub}>Choose a system, then isolate a region</Text>
                </View>
                <TouchableOpacity
                  style={styles.panelClose}
                  onPress={showAll}
                  accessibilityRole="button"
                  accessibilityLabel="Show the whole body and clear any isolation"
                  testID="panel-close"
                >
                  <Ionicons name="close" size={20} color={T.text} />
                </TouchableOpacity>
              </View>

              {/* System first: the model can only show one at a time, so this is
                  a choice, not two independent toggles. */}
              <View style={styles.systemSeg}>
                {EXPLORER.map((section) => {
                  const on = system === section.key;
                  return (
                    <TouchableOpacity
                      key={section.key}
                      style={[styles.systemBtn, on && styles.systemBtnActive]}
                      onPress={() => setSystem(section.key)}
                      accessibilityRole="button"
                      accessibilityState={{ selected: on }}
                      testID={`system-${section.key}`}
                    >
                      <Ionicons name="eye-outline" size={16} color={on ? T.bg : T.text} />
                      <Text style={[styles.systemText, on && styles.systemTextActive]}>
                        {section.key === "muscular" ? "Muscular" : "Skeletal"}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              <View style={styles.regionGrid}>
                {(EXPLORER.find((x) => x.key === system)?.children ?? []).map((c) => {
                  const active = isolate === c.container;
                  const chHidden = hidden.includes(c.container);
                  return (
                    <TouchableOpacity
                      key={c.key}
                      style={[styles.region, active && styles.regionActive, chHidden && styles.chipHidden]}
                      onPress={() => focusCategory(c.container)}
                      onLongPress={() => toggleHidden(c.container)}
                      accessibilityRole="button"
                      accessibilityState={{ selected: active }}
                      accessibilityLabel={`${c.label}${chHidden ? ", hidden" : ""}`}
                      accessibilityHint="Long-press to hide this region"
                      testID={`cat-${c.key}`}
                    >
                      <Ionicons
                        name={c.icon as any}
                        size={17}
                        color={chHidden ? T.textFaint : T.accent}
                      />
                      <Text
                        style={[styles.regionText, active && { color: T.accent }, chHidden && { color: T.textFaint }]}
                        numberOfLines={1}
                      >
                        {c.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              <TouchableOpacity style={styles.showAll} onPress={showAll} testID="show-all-btn">
                <Ionicons name="scan-outline" size={16} color={T.text} />
                <Text style={styles.showAllText}>Show full body</Text>
              </TouchableOpacity>
              <Text style={styles.hint}>Long-press a region to hide</Text>
            </ScrollView>
          </View>
        )}
      </DraggableSheet>
    </View>
  );
}

const makeStyles = (T: LegacyPalette) => StyleSheet.create({
  root: { flex: 1, backgroundColor: T.bg },
  header: { position: "absolute", top: 0, left: 0, right: 0, paddingHorizontal: 18, flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 12 },
  h1: { color: T.text, fontSize: 22, fontWeight: "800" },
  sub: { color: T.textDim, fontSize: 13, marginTop: 2 },
  controls: { flex: 1, paddingHorizontal: 16, paddingTop: 2 },
  segment: { flexDirection: "row", backgroundColor: T.bg2, borderRadius: 22, padding: 4, marginBottom: 12, gap: 4 },
  panelHead: { flexDirection: "row", alignItems: "flex-start", gap: 12, marginBottom: 16 },
  panelTitle: { color: T.text, fontSize: 24, fontWeight: "800" },
  panelSub: { color: T.textDim, fontSize: 13.5, marginTop: 2 },
  panelClose: {
    width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center",
    backgroundColor: T.bg2,
  },
  // The system is a single choice, so the selected half is filled rather than
  // outlined — two outlined halves would read as two independent toggles.
  systemSeg: { flexDirection: "row", gap: 10, marginBottom: 14 },
  systemBtn: {
    flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
    minHeight: 48, borderRadius: 22, backgroundColor: T.bg2,
  },
  systemBtnActive: { backgroundColor: T.accent },
  systemText: { color: T.text, fontSize: 15, fontWeight: "700" },
  systemTextActive: { color: T.bg },
  regionGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  region: {
    width: "48%", flexGrow: 1, flexDirection: "row", alignItems: "center", gap: 10,
    minHeight: 54, paddingHorizontal: 14, borderRadius: 18, backgroundColor: T.bg2,
    borderWidth: 1.5, borderColor: "transparent",
  },
  regionActive: { borderColor: T.accent },
  regionText: { color: T.text, fontSize: 14, fontWeight: "600", flex: 1 },
  sectionHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 8 },
  sectionTitle: { color: T.textDim, fontSize: 12, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.5 },
  // No fill of its own, and a full 44 pt target rather than a 4 pt pad.
  eyeBtn: { width: 44, height: 44, alignItems: "center", justifyContent: "center", backgroundColor: "transparent" },
  chipWrap: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  // Rest border is the button's OWN fill, not "transparent". A transparent
  // border over a filled, rounded view leaves an alpha seam at the curve — the
  // "radius cut". Same geometry in both states, so selecting only recolours.
  chip: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: T.surfaceHi, borderWidth: 1.5, borderColor: T.surfaceHi, paddingHorizontal: 12, paddingVertical: 9, borderRadius: 999 },
  chipActive: { borderColor: T.accent },
  chipHidden: { opacity: 0.5 },
  chipText: { color: T.text, fontSize: 13, fontWeight: "600" },
  chipTextActive: { color: T.accent, fontWeight: "700" },
  hint: { color: T.textFaint, fontSize: 12.5, textAlign: "center", marginTop: 12 },
  shrinkHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 6 },
  shrinkTitle: { color: T.text, fontSize: 16, fontWeight: "700" },
  shrinkPct: { color: T.accent, fontSize: 16, fontWeight: "800" },
  shrinkBtns: { flexDirection: "row", gap: 8, marginTop: 10 },
  smallBtn: { flex: 1, backgroundColor: T.surfaceHi, borderWidth: 1.5, borderColor: T.surfaceHi, paddingVertical: 10, borderRadius: 22, alignItems: "center" },
  smallBtnText: { color: T.text, fontSize: 13, fontWeight: "600" },
  showAll: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: T.bg2, borderWidth: 1.5, borderColor: T.bg2, paddingVertical: 12, borderRadius: 22, marginTop: 12 },
  showAllText: { color: T.text, fontSize: 14, fontWeight: "700" },
});
