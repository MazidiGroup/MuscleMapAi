import React, { useRef, useState } from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";

import { AnatomyViewer, ViewerHandle } from "@/src/anatomy/AnatomyViewer";
import { ScrubSlider } from "@/src/anatomy/ScrubSlider";
import { MuscleSheet } from "@/src/anatomy/MuscleSheet";
import { EXPLORER } from "@/src/anatomy/groups";
import { T } from "@/src/anatomy/ui";

export default function ExploreScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const viewer = useRef<ViewerHandle>(null);

  const [selected, setSelected] = useState<string | null>(null);
  const [isolate, setIsolate] = useState<string | null>(null);
  const [hidden, setHidden] = useState<string[]>([]);
  const [shrink, setShrink] = useState(0);
  const [tab, setTab] = useState<"layers" | "shrink">("layers");

  const toggleHidden = (container: string) => {
    setHidden((h) => (h.includes(container) ? h.filter((c) => c !== container) : [...h, container]));
  };

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
        shrink={shrink}
        onSelect={(name) => setSelected(name)}
      />

      {/* header */}
      <View style={[styles.header, { paddingTop: insets.top + 8 }]} pointerEvents="box-none">
        <View>
          <Text style={styles.h1}>Explore Anatomy</Text>
          <Text style={styles.sub}>Tap a muscle to identify it · drag to rotate</Text>
        </View>
      </View>

      {/* bottom area */}
      {selected ? (
        <View style={styles.sheetWrap}>
          <MuscleSheet
            nodeName={selected}
            onClose={() => {
              setSelected(null);
              viewer.current?.resetView();
            }}
            onExercise={(id) => router.push({ pathname: "/(tabs)/workout", params: { ex: id } })}
          />
        </View>
      ) : (
        <View style={[styles.panel, { paddingBottom: 12 }]}>
          <View style={styles.segment}>
            <SegBtn label="Layers" active={tab === "layers"} onPress={() => setTab("layers")} icon="layers-outline" />
            <SegBtn label="Shrink View" active={tab === "shrink"} onPress={() => setTab("shrink")} icon="contract-outline" />
          </View>

          {tab === "layers" ? (
            <ScrollView style={{ maxHeight: 240 }} showsVerticalScrollIndicator={false}>
              {EXPLORER.map((section) => {
                const sysHidden = hidden.includes(section.container);
                return (
                  <View key={section.key} style={{ marginBottom: 8 }}>
                    <View style={styles.sectionHead}>
                      <Text style={styles.sectionTitle}>{section.label}</Text>
                      <TouchableOpacity
                        onPress={() => toggleHidden(section.container)}
                        style={styles.eyeBtn}
                        testID={`toggle-${section.key}`}
                      >
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
                            <Text style={[styles.chipText, active && styles.chipTextActive, chHidden && { color: T.textFaint }]}>
                              {c.label}
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  </View>
                );
              })}
              <Text style={styles.hint}>Tap a region to isolate it · long-press to hide</Text>
            </ScrollView>
          ) : (
            <View style={{ paddingVertical: 8 }}>
              <View style={styles.shrinkHead}>
                <Text style={styles.shrinkTitle}>Shrunken Muscle View</Text>
                <Text style={styles.shrinkPct}>{Math.round(shrink * 100)}%</Text>
              </View>
              <ScrubSlider value={shrink} onChange={setShrink} />
              <View style={styles.shrinkBtns}>
                <TouchableOpacity style={styles.smallBtn} onPress={() => setShrink(0)} testID="shrink-normal">
                  <Text style={styles.smallBtnText}>Normal</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.smallBtn} onPress={() => setShrink(1)} testID="shrink-full">
                  <Text style={styles.smallBtnText}>Fully Shrunken</Text>
                </TouchableOpacity>
              </View>
              <Text style={styles.hint}>Scrub to morph muscles between full volume and atrophied state.</Text>
            </View>
          )}

          <TouchableOpacity style={styles.showAll} onPress={showAll} testID="show-all-btn">
            <Ionicons name="scan-outline" size={16} color={T.text} />
            <Text style={styles.showAllText}>Show Full Body</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

function SegBtn({ label, active, onPress, icon }: { label: string; active: boolean; onPress: () => void; icon: any }) {
  return (
    <TouchableOpacity style={[styles.segBtn, active && styles.segBtnActive]} onPress={onPress}>
      <Ionicons name={icon} size={15} color={active ? T.bg : T.textDim} />
      <Text style={[styles.segText, active && styles.segTextActive]}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: T.bg },
  header: { position: "absolute", top: 0, left: 0, right: 0, paddingHorizontal: 18 },
  h1: { color: T.text, fontSize: 22, fontWeight: "800" },
  sub: { color: T.textDim, fontSize: 13, marginTop: 2 },
  sheetWrap: { position: "absolute", left: 0, right: 0, bottom: 0 },
  panel: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: T.surface,
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    borderWidth: 1,
    borderColor: T.border,
    paddingHorizontal: 16,
    paddingTop: 14,
  },
  segment: { flexDirection: "row", backgroundColor: T.bg2, borderRadius: 12, padding: 4, marginBottom: 12, gap: 4 },
  segBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 9, borderRadius: 9 },
  segBtnActive: { backgroundColor: T.accent },
  segText: { color: T.textDim, fontSize: 13, fontWeight: "700" },
  segTextActive: { color: T.bg },
  sectionHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 8 },
  sectionTitle: { color: T.textDim, fontSize: 12, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.5 },
  eyeBtn: { padding: 4 },
  chipWrap: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: T.surfaceHi,
    borderWidth: 1,
    borderColor: T.border,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 999,
  },
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
  showAll: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: T.bg2,
    borderWidth: 1,
    borderColor: T.borderHi,
    paddingVertical: 12,
    borderRadius: 12,
    marginTop: 12,
  },
  showAllText: { color: T.text, fontSize: 14, fontWeight: "700" },
});
