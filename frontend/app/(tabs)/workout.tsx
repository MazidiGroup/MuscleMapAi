import React, { useEffect, useMemo, useState } from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams } from "expo-router";

import { AnatomyViewer } from "@/src/anatomy/AnatomyViewer";
import { EXERCISES, EXERCISE_CATEGORIES, Exercise } from "@/src/anatomy/exercises";
import { prettyName } from "@/src/anatomy/groups";
import { getMuscleInfo } from "@/src/anatomy/muscleData";
import { T } from "@/src/anatomy/ui";

export default function WorkoutScreen() {
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ ex?: string }>();
  const [cat, setCat] = useState<(typeof EXERCISE_CATEGORIES)[number]>("Push");
  const [selectedId, setSelectedId] = useState<string>(EXERCISES[0].id);

  useEffect(() => {
    if (params.ex) {
      const ex = EXERCISES.find((e) => e.id === params.ex);
      if (ex) {
        setSelectedId(ex.id);
        setCat(ex.category);
      }
    }
  }, [params.ex]);

  const selected = useMemo<Exercise>(() => EXERCISES.find((e) => e.id === selectedId)!, [selectedId]);
  const list = useMemo(() => EXERCISES.filter((e) => e.category === cat), [cat]);

  const muscleLabel = (n: string) => getMuscleInfo(n)?.label || prettyName(n);

  return (
    <View style={styles.root}>
      <AnatomyViewer mode="workout" primary={selected.primary} secondary={selected.secondary} />

      <View style={[styles.header, { paddingTop: insets.top + 8, pointerEvents: "box-none" }]}>
        <Text style={styles.h1}>Workout Mode</Text>
        <Text style={styles.sub}>See exactly which muscles fire</Text>
      </View>

      {/* legend */}
      <View style={[styles.legend, { top: insets.top + 8, pointerEvents: "none" }]}>
        <View style={styles.legendRow}>
          <View style={[styles.dot, { backgroundColor: T.primary }]} />
          <Text style={styles.legendText}>Primary</Text>
        </View>
        <View style={styles.legendRow}>
          <View style={[styles.dot, { backgroundColor: T.secondary }]} />
          <Text style={styles.legendText}>Secondary</Text>
        </View>
      </View>

      <View style={styles.panel}>
        {/* selected exercise detail */}
        <Text style={styles.exName} testID="workout-ex-name">
          {selected.name}
        </Text>
        <Text style={styles.cue}>{selected.cue}</Text>
        <View style={styles.muscleChips}>
          {selected.primary.map((m) => (
            <View key={m} style={[styles.mChip, { borderColor: T.primary + "66", backgroundColor: T.primary + "1A" }]}>
              <Text style={[styles.mChipText, { color: T.primary }]}>{muscleLabel(m)}</Text>
            </View>
          ))}
          {selected.secondary.map((m) => (
            <View key={m} style={[styles.mChip, { borderColor: T.secondary + "66", backgroundColor: T.secondary + "1A" }]}>
              <Text style={[styles.mChipText, { color: T.secondary }]}>{muscleLabel(m)}</Text>
            </View>
          ))}
        </View>

        {/* category tabs */}
        <View style={styles.cats}>
          {EXERCISE_CATEGORIES.map((c) => (
            <TouchableOpacity key={c} style={[styles.catBtn, cat === c && styles.catBtnActive]} onPress={() => setCat(c)} testID={`cat-${c}`}>
              <Text style={[styles.catText, cat === c && styles.catTextActive]}>{c}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* exercise list */}
        <ScrollView style={{ maxHeight: 168 }} showsVerticalScrollIndicator={false}>
          {list.map((e) => {
            const active = e.id === selectedId;
            return (
              <TouchableOpacity
                key={e.id}
                style={[styles.exRow, active && styles.exRowActive]}
                onPress={() => setSelectedId(e.id)}
                testID={`ex-${e.id}`}
              >
                <View style={[styles.exIcon, active && { backgroundColor: T.accent }]}>
                  <Ionicons name="barbell-outline" size={16} color={active ? T.bg : T.accent} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.exRowName}>{e.name}</Text>
                  <Text style={styles.exRowEquip}>{e.equipment}</Text>
                </View>
                {active && <Ionicons name="checkmark-circle" size={20} color={T.accent} />}
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: T.bg },
  header: { position: "absolute", top: 0, left: 0, right: 0, paddingHorizontal: 18 },
  h1: { color: T.text, fontSize: 22, fontWeight: "800" },
  sub: { color: T.textDim, fontSize: 13, marginTop: 2 },
  legend: { position: "absolute", right: 64, gap: 6 },
  legendRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  legendText: { color: T.textDim, fontSize: 12, fontWeight: "600" },
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
    paddingTop: 16,
    paddingBottom: 14,
  },
  exName: { color: T.text, fontSize: 20, fontWeight: "800" },
  cue: { color: T.textDim, fontSize: 13, lineHeight: 19, marginTop: 4 },
  muscleChips: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 10, marginBottom: 12 },
  mChip: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999, borderWidth: 1 },
  mChipText: { fontSize: 12, fontWeight: "700" },
  cats: { flexDirection: "row", backgroundColor: T.bg2, borderRadius: 12, padding: 4, gap: 4, marginBottom: 10 },
  catBtn: { flex: 1, paddingVertical: 8, borderRadius: 9, alignItems: "center" },
  catBtnActive: { backgroundColor: T.accent },
  catText: { color: T.textDim, fontSize: 13, fontWeight: "700" },
  catTextActive: { color: T.bg },
  exRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderRadius: 12,
    marginBottom: 6,
    borderWidth: 1,
    borderColor: "transparent",
  },
  exRowActive: { backgroundColor: T.surfaceHi, borderColor: T.borderHi },
  exIcon: { width: 34, height: 34, borderRadius: 17, backgroundColor: T.surfaceHi, alignItems: "center", justifyContent: "center" },
  exRowName: { color: T.text, fontSize: 15, fontWeight: "600" },
  exRowEquip: { color: T.textFaint, fontSize: 12, marginTop: 1 },
});
