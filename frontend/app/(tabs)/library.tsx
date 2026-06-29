import React, { useCallback, useMemo, useState } from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, Modal, Pressable } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "expo-router";

import { MuscleSheet } from "@/src/anatomy/MuscleSheet";
import { GYM_GROUPS, GYM_GROUP_ORDER, prettyName } from "@/src/anatomy/groups";
import { MUSCLE_DATA, getMuscleInfo } from "@/src/anatomy/muscleData";
import { getBookmarks, getRecent } from "@/src/anatomy/storageLists";
import { T, GROUP_COLORS } from "@/src/anatomy/ui";

export default function LibraryScreen() {
  const insets = useSafeAreaInsets();
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const [recent, setRecent] = useState<string[]>([]);
  const [bookmarks, setBookmarks] = useState<string[]>([]);

  const refresh = useCallback(() => {
    getRecent().then(setRecent);
    getBookmarks().then(setBookmarks);
  }, []);

  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh]),
  );

  const groups = useMemo(() => {
    const q = query.trim().toLowerCase();
    return GYM_GROUP_ORDER.map((key) => {
      const g = GYM_GROUPS[key];
      const items = g.nodes.filter((n) => {
        const label = (MUSCLE_DATA[n]?.label || n).toLowerCase();
        return !q || label.includes(q) || key.includes(q);
      });
      return { key, label: g.label, items };
    }).filter((g) => g.items.length > 0);
  }, [query]);

  const open = (n: string) => setSelected(n);
  const closeSheet = () => {
    setSelected(null);
    refresh();
  };

  return (
    <View style={styles.root}>
      <View style={{ paddingTop: insets.top + 12, paddingHorizontal: 18 }}>
        <Text style={styles.h1}>Library</Text>
        <Text style={styles.sub}>Muscle reference · bookmarks · history</Text>
        <View style={styles.search}>
          <Ionicons name="search" size={18} color={T.textFaint} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search muscles…"
            placeholderTextColor={T.textFaint}
            value={query}
            onChangeText={setQuery}
            testID="library-search"
          />
          {query.length > 0 && (
            <TouchableOpacity onPress={() => setQuery("")}>
              <Ionicons name="close-circle" size={18} color={T.textFaint} />
            </TouchableOpacity>
          )}
        </View>
      </View>

      <ScrollView contentContainerStyle={{ padding: 18, paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
        {query.length === 0 && bookmarks.length > 0 && (
          <Pills title="Bookmarked" icon="bookmark" data={bookmarks} onPress={open} />
        )}
        {query.length === 0 && recent.length > 0 && (
          <Pills title="Recently Viewed" icon="time-outline" data={recent} onPress={open} />
        )}

        {groups.map((g) => {
          const color = GROUP_COLORS[g.key] || T.accent;
          return (
            <View key={g.key} style={{ marginBottom: 18 }}>
              <View style={styles.groupHead}>
                <View style={[styles.gdot, { backgroundColor: color }]} />
                <Text style={styles.groupTitle}>{g.label}</Text>
              </View>
              {g.items.map((n) => {
                const info = getMuscleInfo(n);
                return (
                  <TouchableOpacity key={n} style={styles.row} onPress={() => open(n)} testID={`lib-${n}`}>
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

        {/* About */}
        {query.length === 0 && (
          <View style={styles.about}>
            <Text style={styles.aboutTitle}>About</Text>
            <Text style={styles.aboutText}>
              Fitness Anatomy Trainer — an interactive 3D écorché (real-scale 180 cm) with 270 named
              structures, morph-target muscle atrophy, an AI coach and guided lessons.
            </Text>
            <Text style={styles.version}>v1.0 · Explore · Workout · Learn · Coach</Text>
          </View>
        )}
      </ScrollView>

      <Modal visible={!!selected} transparent animationType="slide" onRequestClose={closeSheet}>
        <Pressable style={styles.backdrop} onPress={closeSheet} />
        <View style={styles.modalBottom}>{selected && <MuscleSheet nodeName={selected} onClose={closeSheet} />}</View>
      </Modal>
    </View>
  );
}

function Pills({ title, icon, data, onPress }: { title: string; icon: any; data: string[]; onPress: (n: string) => void }) {
  return (
    <View style={{ marginBottom: 18 }}>
      <View style={styles.groupHead}>
        <Ionicons name={icon} size={15} color={T.accent} />
        <Text style={styles.groupTitle}>{title}</Text>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <View style={{ flexDirection: "row", gap: 8 }}>
          {data.map((n) => (
            <TouchableOpacity key={n} style={styles.pill} onPress={() => onPress(n)}>
              <Text style={styles.pillText}>{getMuscleInfo(n)?.label || prettyName(n)}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: T.bg },
  h1: { color: T.text, fontSize: 26, fontWeight: "800" },
  sub: { color: T.textDim, fontSize: 13, marginTop: 2 },
  search: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: T.surface, borderWidth: 1, borderColor: T.border, borderRadius: 12, paddingHorizontal: 12, height: 44, marginTop: 14 },
  searchInput: { flex: 1, color: T.text, fontSize: 15 },
  groupHead: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 8 },
  gdot: { width: 10, height: 10, borderRadius: 5 },
  groupTitle: { color: T.text, fontSize: 17, fontWeight: "800" },
  row: { flexDirection: "row", alignItems: "center", backgroundColor: T.surface, borderWidth: 1, borderColor: T.border, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, marginBottom: 8 },
  rowName: { color: T.text, fontSize: 15, fontWeight: "600" },
  rowFn: { color: T.textFaint, fontSize: 12, marginTop: 2 },
  pill: { backgroundColor: T.surfaceHi, borderWidth: 1, borderColor: T.border, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 9 },
  pillText: { color: T.text, fontSize: 13, fontWeight: "600" },
  empty: { color: T.textDim, fontSize: 14, textAlign: "center", marginTop: 40 },
  about: { marginTop: 6, paddingTop: 16, borderTopWidth: 1, borderTopColor: T.border },
  aboutTitle: { color: T.textDim, fontSize: 12, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8 },
  aboutText: { color: T.textDim, fontSize: 14, lineHeight: 21 },
  version: { color: T.textFaint, fontSize: 12, marginTop: 12 },
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.6)" },
  modalBottom: { position: "absolute", left: 0, right: 0, bottom: 0 },
});
