import React, { useMemo, useState } from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, Modal, Pressable } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";

import { MuscleSheet } from "@/src/anatomy/MuscleSheet";
import { GYM_GROUPS, GYM_GROUP_ORDER } from "@/src/anatomy/groups";
import { MUSCLE_DATA } from "@/src/anatomy/muscleData";
import { T, GROUP_COLORS } from "@/src/anatomy/ui";

export default function InfoScreen() {
  const insets = useSafeAreaInsets();
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<string | null>(null);

  const groups = useMemo(() => {
    const q = query.trim().toLowerCase();
    return GYM_GROUP_ORDER.map((key) => {
      const g = GYM_GROUPS[key];
      const items = g.nodes.filter((n) => {
        const info = MUSCLE_DATA[n];
        const label = (info?.label || n).toLowerCase();
        return !q || label.includes(q) || key.includes(q);
      });
      return { key, label: g.label, items };
    }).filter((g) => g.items.length > 0);
  }, [query]);

  return (
    <View style={styles.root}>
      <View style={{ paddingTop: insets.top + 12, paddingHorizontal: 18 }}>
        <Text style={styles.h1}>Muscle Info</Text>
        <Text style={styles.sub}>Anatomy reference for {Object.keys(MUSCLE_DATA).length} key muscles</Text>
        <View style={styles.search}>
          <Ionicons name="search" size={18} color={T.textFaint} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search muscles…"
            placeholderTextColor={T.textFaint}
            value={query}
            onChangeText={setQuery}
            testID="muscle-search"
          />
          {query.length > 0 && (
            <TouchableOpacity onPress={() => setQuery("")}>
              <Ionicons name="close-circle" size={18} color={T.textFaint} />
            </TouchableOpacity>
          )}
        </View>
      </View>

      <ScrollView contentContainerStyle={{ padding: 18, paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
        {groups.map((g) => {
          const color = GROUP_COLORS[g.key] || T.accent;
          return (
            <View key={g.key} style={{ marginBottom: 18 }}>
              <View style={styles.groupHead}>
                <View style={[styles.gdot, { backgroundColor: color }]} />
                <Text style={styles.groupTitle}>{g.label}</Text>
              </View>
              {g.items.map((n) => {
                const info = MUSCLE_DATA[n];
                return (
                  <TouchableOpacity key={n} style={styles.row} onPress={() => setSelected(n)} testID={`info-${n}`}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.rowName}>{info?.label || n}</Text>
                      {info && <Text style={styles.rowFn} numberOfLines={1}>{info.fn}</Text>}
                    </View>
                    <Ionicons name="chevron-forward" size={18} color={T.textFaint} />
                  </TouchableOpacity>
                );
              })}
            </View>
          );
        })}
        {groups.length === 0 && <Text style={styles.empty}>No muscles match “{query}”.</Text>}
      </ScrollView>

      <Modal visible={!!selected} transparent animationType="slide" onRequestClose={() => setSelected(null)}>
        <Pressable style={styles.backdrop} onPress={() => setSelected(null)} />
        <View style={styles.modalBottom}>{selected && <MuscleSheet nodeName={selected} onClose={() => setSelected(null)} />}</View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: T.bg },
  h1: { color: T.text, fontSize: 26, fontWeight: "800" },
  sub: { color: T.textDim, fontSize: 13, marginTop: 2 },
  search: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: T.surface,
    borderWidth: 1,
    borderColor: T.border,
    borderRadius: 12,
    paddingHorizontal: 12,
    height: 44,
    marginTop: 14,
  },
  searchInput: { flex: 1, color: T.text, fontSize: 15 },
  groupHead: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 8 },
  gdot: { width: 10, height: 10, borderRadius: 5 },
  groupTitle: { color: T.text, fontSize: 17, fontWeight: "800" },
  row: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: T.surface,
    borderWidth: 1,
    borderColor: T.border,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 8,
  },
  rowName: { color: T.text, fontSize: 15, fontWeight: "600" },
  rowFn: { color: T.textFaint, fontSize: 12, marginTop: 2 },
  empty: { color: T.textDim, fontSize: 14, textAlign: "center", marginTop: 40 },
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.6)" },
  modalBottom: { position: "absolute", left: 0, right: 0, bottom: 0 },
});
