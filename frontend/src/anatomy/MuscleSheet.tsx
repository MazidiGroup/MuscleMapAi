import React from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { T, GROUP_COLORS } from "./ui";
import { getMuscleInfo } from "./muscleData";
import { prettyName, GYM_GROUPS } from "./groups";
import { getExercise } from "./exercises";

type Props = {
  nodeName: string;
  onClose?: () => void;
  onExercise?: (id: string) => void;
};

export function MuscleSheet({ nodeName, onClose, onExercise }: Props) {
  const info = getMuscleInfo(nodeName);
  const title = info?.label || prettyName(nodeName);
  const groupKey = info?.group;
  const groupLabel = groupKey ? GYM_GROUPS[groupKey]?.label : "Anatomical structure";
  const accent = groupKey ? GROUP_COLORS[groupKey] || T.accent : T.accent;

  return (
    <View style={styles.card} testID="muscle-detail">
      <View style={styles.handle} />
      <View style={styles.headerRow}>
        <View style={{ flex: 1 }}>
          <View style={[styles.tag, { backgroundColor: accent + "22", borderColor: accent + "55" }]}>
            <Text style={[styles.tagText, { color: accent }]}>{groupLabel}</Text>
          </View>
          <Text style={styles.title} testID="muscle-detail-title">
            {title}
          </Text>
        </View>
        {onClose && (
          <TouchableOpacity onPress={onClose} style={styles.closeBtn} testID="muscle-detail-close">
            <Ionicons name="close" size={22} color={T.textDim} />
          </TouchableOpacity>
        )}
      </View>

      <ScrollView style={{ maxHeight: 340 }} showsVerticalScrollIndicator={false}>
        {info ? (
          <>
            <Field icon="flash-outline" label="Function" value={info.fn} />
            <Field icon="arrow-up-circle-outline" label="Origin" value={info.origin} />
            <Field icon="arrow-down-circle-outline" label="Insertion" value={info.insertion} />
            <Field icon="swap-horizontal-outline" label="Antagonist" value={info.antagonist} />

            {info.exercises.length > 0 && (
              <View style={{ marginTop: 14 }}>
                <Text style={styles.sectionLabel}>Best Exercises</Text>
                <View style={styles.exWrap}>
                  {info.exercises.map((id) => {
                    const ex = getExercise(id);
                    if (!ex) return null;
                    return (
                      <TouchableOpacity
                        key={id}
                        style={styles.exChip}
                        onPress={() => onExercise?.(id)}
                        testID={`muscle-ex-${id}`}
                      >
                        <Ionicons name="barbell-outline" size={14} color={T.accent} />
                        <Text style={styles.exChipText}>{ex.name}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>
            )}
          </>
        ) : (
          <View style={styles.fallback}>
            <Ionicons name="information-circle-outline" size={20} color={T.textDim} />
            <Text style={styles.fallbackText}>
              Detailed data for this structure isn&apos;t available yet. It&apos;s part of the {groupLabel?.toLowerCase()} region.
            </Text>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

function Field({ icon, label, value }: { icon: any; label: string; value: string }) {
  return (
    <View style={styles.field}>
      <View style={styles.fieldHead}>
        <Ionicons name={icon} size={15} color={T.accent} />
        <Text style={styles.fieldLabel}>{label}</Text>
      </View>
      <Text style={styles.fieldValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: T.surface,
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    borderWidth: 1,
    borderColor: T.border,
    paddingHorizontal: 18,
    paddingBottom: 26,
    paddingTop: 10,
  },
  handle: { alignSelf: "center", width: 42, height: 5, borderRadius: 3, backgroundColor: "rgba(120,160,220,0.25)", marginBottom: 10 },
  headerRow: { flexDirection: "row", alignItems: "flex-start", marginBottom: 12 },
  tag: { alignSelf: "flex-start", paddingHorizontal: 10, paddingVertical: 3, borderRadius: 999, borderWidth: 1, marginBottom: 6 },
  tagText: { fontSize: 11, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.4 },
  title: { color: T.text, fontSize: 24, fontWeight: "800" },
  closeBtn: { width: 36, height: 36, alignItems: "center", justifyContent: "center" },
  field: { marginBottom: 12 },
  fieldHead: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 3 },
  fieldLabel: { color: T.accent, fontSize: 12, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.4 },
  fieldValue: { color: T.text, fontSize: 15, lineHeight: 21 },
  sectionLabel: { color: T.textDim, fontSize: 12, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.4, marginBottom: 8 },
  exWrap: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  exChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: T.surfaceHi,
    borderWidth: 1,
    borderColor: T.border,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
  },
  exChipText: { color: T.text, fontSize: 13, fontWeight: "600" },
  fallback: { flexDirection: "row", gap: 8, alignItems: "flex-start", paddingVertical: 8 },
  fallbackText: { color: T.textDim, fontSize: 14, lineHeight: 20, flex: 1 },
});
