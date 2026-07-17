import React, { useCallback, useMemo, useState } from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, Modal, Pressable, Linking, Alert, Platform } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";

import { MuscleSheet } from "@/src/anatomy/MuscleSheet";
import { GYM_GROUPS, GYM_GROUP_ORDER, prettyName } from "@/src/anatomy/groups";
import { MUSCLE_DATA, getMuscleInfo } from "@/src/anatomy/muscleData";
import { EXERCISES, Exercise } from "@/src/anatomy/exercises";
import { getExerciseMeta } from "@/src/anatomy/gymGuide";
import { exerciseMatches, exerciseGroup, muscleAliasMatches } from "@/src/anatomy/search";
import { getBookmarks, getRecent } from "@/src/anatomy/storageLists";
import { T, GROUP_COLORS } from "@/src/anatomy/ui";
import { useAuth } from "@/src/auth/AuthContext";
import { FLAGS } from "@/src/config/featureFlags";

type LibSeg = "muscles" | "exercises";
type GroupBy = "muscle" | "equipment" | "movement";

const GROUP_BY_OPTIONS: { key: GroupBy; label: string }[] = [
  { key: "muscle", label: "By Muscle" },
  { key: "equipment", label: "By Equipment" },
  { key: "movement", label: "By Movement" },
];

export default function LibraryScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user, logout, deleteAccount } = useAuth();
  const [query, setQuery] = useState("");
  const [seg, setSeg] = useState<LibSeg>("muscles");
  const [groupBy, setGroupBy] = useState<GroupBy>("muscle");
  const [selected, setSelected] = useState<string | null>(null);
  const [recent, setRecent] = useState<string[]>([]);
  const [bookmarks, setBookmarks] = useState<string[]>([]);

  const confirmLogout = useCallback(() => {
    if (Platform.OS === "web") {
      // eslint-disable-next-line no-alert
      if (window.confirm("Log out of Muscle Map Ai?")) logout();
      return;
    }
    Alert.alert("Log out", "Log out of Muscle Map Ai?", [
      { text: "Cancel", style: "cancel" },
      { text: "Log Out", style: "destructive", onPress: () => logout() },
    ]);
  }, [logout]);

  const runDelete = useCallback(async () => {
    const res = await deleteAccount();
    if (res.ok) {
      // On success AuthProvider has already cleared session; the root layout
      // will redirect to /login. Give the user a small confirmation on web.
      if (Platform.OS === "web") {
        // eslint-disable-next-line no-alert
        window.alert("Your account has been deleted.");
      }
    } else {
      const msg = res.error || "Couldn't delete your account. Please try again.";
      if (Platform.OS === "web") {
        // eslint-disable-next-line no-alert
        window.alert(msg);
      } else {
        Alert.alert("Delete failed", msg);
      }
    }
  }, [deleteAccount]);

  const confirmDeleteAccount = useCallback(() => {
    // Two-step confirmation on native (Apple 5.1.1(v) requires clear intent).
    const step2 = () => {
      if (Platform.OS === "web") {
        // eslint-disable-next-line no-alert
        if (window.confirm("Final confirmation: permanently delete your account and all data? This cannot be undone.")) {
          runDelete();
        }
        return;
      }
      Alert.alert(
        "Delete account permanently?",
        "This will permanently delete your account, your workout history, coach chats and subscription record. This cannot be undone.",
        [
          { text: "Cancel", style: "cancel" },
          { text: "Delete Forever", style: "destructive", onPress: runDelete },
        ],
      );
    };
    if (Platform.OS === "web") {
      // eslint-disable-next-line no-alert
      if (window.confirm("Delete your Muscle Map Ai account?")) step2();
      return;
    }
    Alert.alert(
      "Delete account?",
      "Deleting your account removes all your data from our servers. You can create a new account anytime.",
      [
        { text: "Cancel", style: "cancel" },
        { text: "Continue", style: "destructive", onPress: step2 },
      ],
    );
  }, [runDelete]);

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
        return !q || label.includes(q) || key.includes(q) || muscleAliasMatches(n, q);
      });
      return { key, label: g.label, items };
    }).filter((g) => g.items.length > 0);
  }, [query]);

  const exerciseSections = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = EXERCISES.filter((e) => exerciseMatches(e, q));
    const buckets: Record<string, Exercise[]> = {};
    const keyOf = (e: Exercise) => (groupBy === "equipment" ? e.equipment : groupBy === "movement" ? e.category : exerciseGroup(e));
    for (const e of filtered) {
      const k = keyOf(e);
      if (!buckets[k]) buckets[k] = [];
      buckets[k].push(e);
    }
    const order = groupBy === "muscle" ? [...GYM_GROUP_ORDER, "other"].filter((k) => buckets[k]) : Object.keys(buckets).sort();
    return order.map((k) => ({
      key: k,
      label: groupBy === "muscle" ? GYM_GROUPS[k]?.label || "Other" : k,
      color: groupBy === "muscle" ? GROUP_COLORS[k] || T.accent : T.accent,
      items: buckets[k],
    }));
  }, [query, groupBy]);

  const open = (n: string) => setSelected(n);
  const closeSheet = () => {
    setSelected(null);
    refresh();
  };

  return (
    <View style={styles.root}>
      <View style={{ paddingTop: insets.top + 12, paddingHorizontal: 18 }}>
        <Text style={styles.h1}>Library</Text>
        <Text style={styles.sub}>Exercises · muscle guide · account</Text>
        <View style={styles.search}>
          <Ionicons name="search" size={18} color={T.textFaint} />
          <TextInput
            style={styles.searchInput}
            placeholder={seg === "exercises" ? "Search exercises…" : "Search muscles…"}
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
        {FLAGS.libraryExercises && (
          <View style={styles.libSeg}>
            {(["muscles", "exercises"] as LibSeg[]).map((s) => (
              <TouchableOpacity key={s} style={[styles.libSegBtn, seg === s && styles.libSegActive]} onPress={() => setSeg(s)} testID={`lib-seg-${s}`}>
                <Ionicons name={s === "muscles" ? "body-outline" : "barbell-outline"} size={15} color={seg === s ? T.bg : T.textDim} />
                <Text style={[styles.libSegText, seg === s && styles.libSegTextActive]}>{s === "muscles" ? "Muscles" : "Exercises"}</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}
      </View>

      <ScrollView contentContainerStyle={{ padding: 18, paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
        {seg === "muscles" && (
          <>
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
          </>
        )}

        {seg === "exercises" && (
          <>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0, marginBottom: 14 }}>
              <View style={{ flexDirection: "row", gap: 8 }}>
                {GROUP_BY_OPTIONS.map((o) => (
                  <TouchableOpacity
                    key={o.key}
                    style={[styles.gbChip, groupBy === o.key && styles.gbChipActive]}
                    onPress={() => setGroupBy(o.key)}
                    testID={`lib-groupby-${o.key}`}
                  >
                    <Text style={[styles.gbChipText, groupBy === o.key && { color: T.bg }]}>{o.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </ScrollView>

            {exerciseSections.map((s) => (
              <View key={s.key} style={{ marginBottom: 18 }}>
                <View style={styles.groupHead}>
                  <View style={[styles.gdot, { backgroundColor: s.color }]} />
                  <Text style={styles.groupTitle}>{s.label}</Text>
                  <Text style={styles.groupCount}>{s.items.length}</Text>
                </View>
                {s.items.map((e) => {
                  const meta = getExerciseMeta(e.id);
                  return (
                    <TouchableOpacity key={e.id} style={styles.row} onPress={() => router.push(`/exercise/${e.id}`)} testID={`lib-ex-${e.id}`}>
                      <View style={[styles.exIcon, { backgroundColor: s.color + "1A" }]}>
                        <Ionicons name={meta.icon as any} size={18} color={s.color} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.rowName}>{e.name}</Text>
                        <Text style={styles.rowFn} numberOfLines={1}>
                          {meta.difficulty} · {e.equipment} · {e.category}
                        </Text>
                      </View>
                      <Ionicons name="chevron-forward" size={18} color={T.textFaint} />
                    </TouchableOpacity>
                  );
                })}
              </View>
            ))}
            {exerciseSections.length === 0 && <Text style={styles.empty}>No exercises match “{query}”.</Text>}
          </>
        )}

        {/* Account */}
        {query.length === 0 && user && (
          <View style={styles.about}>
            <Text style={styles.aboutTitle}>Account</Text>
            <View style={styles.linkList}>
              {user.is_guest ? (
                <>
                  <View style={styles.linkRow} testID="account-info">
                    <Ionicons name="person-circle-outline" size={20} color={T.accent} />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.linkRowText} numberOfLines={1}>Guest</Text>
                      <Text style={styles.accountEmail} numberOfLines={1}>Browsing without an account</Text>
                    </View>
                  </View>
                  <TouchableOpacity style={styles.linkRow} onPress={() => router.push("/login")} testID="signin-btn">
                    <Ionicons name="log-in-outline" size={18} color={T.accent} />
                    <Text style={[styles.linkRowText, { color: T.accent }]}>Sign In or Create Account</Text>
                    <Ionicons name="chevron-forward" size={16} color={T.textFaint} />
                  </TouchableOpacity>
                </>
              ) : (
                <>
                  <View style={styles.linkRow} testID="account-info">
                    <Ionicons name="person-circle-outline" size={20} color={T.accent} />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.linkRowText} numberOfLines={1}>{user.name}</Text>
                      <Text style={styles.accountEmail} numberOfLines={1}>{user.email}</Text>
                    </View>
                  </View>
                  <TouchableOpacity style={styles.linkRow} onPress={confirmLogout} testID="logout-btn">
                    <Ionicons name="log-out-outline" size={18} color="#EF4444" />
                    <Text style={[styles.linkRowText, { color: "#EF4444" }]}>Log Out</Text>
                    <Ionicons name="chevron-forward" size={16} color={T.textFaint} />
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.linkRow} onPress={confirmDeleteAccount} testID="delete-account-btn">
                    <Ionicons name="trash-outline" size={18} color="#EF4444" />
                    <Text style={[styles.linkRowText, { color: "#EF4444" }]}>Delete Account</Text>
                    <Ionicons name="chevron-forward" size={16} color={T.textFaint} />
                  </TouchableOpacity>
                </>
              )}
            </View>
          </View>
        )}

        {/* About */}
        {query.length === 0 && (
          <View style={styles.about}>
            <Text style={styles.aboutTitle}>About</Text>
            <Text style={styles.aboutText}>
              Muscle Map Ai — explore a life-size 3D muscle model with 270 named structures,
              see how muscles shrink, track your workouts and learn with lessons and an AI coach.
            </Text>
            <Text style={styles.version}>v1.1.0 · Explore · Workout · Learn · Coach</Text>

            <View style={styles.linkList}>
              <TouchableOpacity style={styles.linkRow} onPress={() => router.push("/references")} testID="link-references">
                <Ionicons name="library-outline" size={18} color={T.accent} />
                <Text style={styles.linkRowText}>Sources & References</Text>
                <Ionicons name="chevron-forward" size={16} color={T.textFaint} />
              </TouchableOpacity>
              <TouchableOpacity style={styles.linkRow} onPress={() => router.push("/privacy")} testID="link-privacy">
                <Ionicons name="shield-checkmark-outline" size={18} color={T.accent} />
                <Text style={styles.linkRowText}>Privacy Policy</Text>
                <Ionicons name="chevron-forward" size={16} color={T.textFaint} />
              </TouchableOpacity>
              <TouchableOpacity style={styles.linkRow} onPress={() => router.push("/terms")} testID="link-terms">
                <Ionicons name="document-text-outline" size={18} color={T.accent} />
                <Text style={styles.linkRowText}>Terms of Use</Text>
                <Ionicons name="chevron-forward" size={16} color={T.textFaint} />
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.linkRow}
                onPress={() => Linking.openURL("mailto:info@mazidigroup.com?subject=Muscle%20Map%20Ai%20Support")}
                testID="link-support"
              >
                <Ionicons name="mail-outline" size={18} color={T.accent} />
                <Text style={styles.linkRowText}>Contact Support</Text>
                <Ionicons name="open-outline" size={16} color={T.textFaint} />
              </TouchableOpacity>
            </View>
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
  libSeg: { flexDirection: "row", backgroundColor: T.surface, borderRadius: 12, padding: 4, gap: 4, marginTop: 10, borderWidth: 1, borderColor: T.border },
  libSegBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 9, borderRadius: 9 },
  libSegActive: { backgroundColor: T.accent },
  libSegText: { color: T.textDim, fontSize: 13, fontWeight: "700" },
  libSegTextActive: { color: T.bg },
  gbChip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999, backgroundColor: T.surfaceHi, borderWidth: 1, borderColor: T.border },
  gbChipActive: { backgroundColor: T.accent, borderColor: T.accent },
  gbChipText: { color: T.text, fontSize: 13, fontWeight: "700" },
  exIcon: { width: 36, height: 36, borderRadius: 10, alignItems: "center", justifyContent: "center", marginRight: 12 },
  groupCount: { color: T.textFaint, fontSize: 12, fontWeight: "700", marginLeft: "auto" },
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
  linkList: { marginTop: 16, gap: 8 },
  linkRow: { flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: T.surface, borderWidth: 1, borderColor: T.border, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 13 },
  linkRowText: { flex: 1, color: T.text, fontSize: 15, fontWeight: "600" },
  accountEmail: { color: T.textFaint, fontSize: 12, marginTop: 1 },
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.6)" },
  modalBottom: { position: "absolute", left: 0, right: 0, bottom: 0 },
});
