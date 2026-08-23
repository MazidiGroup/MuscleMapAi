import React, { useCallback, useMemo, useState } from "react";
import { View, Text, StyleSheet, ScrollView, TextInput, Modal, Pressable, Linking, Alert, Platform } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import Constants from "expo-constants";

import { MuscleSheet } from "@/src/anatomy/MuscleSheet";
import { GYM_GROUPS, GYM_GROUP_ORDER, prettyName } from "@/src/anatomy/groups";
import { MUSCLE_DATA, getMuscleInfo } from "@/src/anatomy/muscleData";
import { LESSONS } from "@/src/anatomy/lessons";
import { getCatalogExercise } from "@/src/anatomy/exerciseCatalog";
import { useWorkout } from "@/src/anatomy/workoutStore";
import {
  CatalogFilters,
  activeFilterCount,
  catalogIntegrity,
  noMatchCopy,
  queryCatalogue,
  resultCountLabel,
  searchPlaceholder,
} from "@/src/library/catalogQuery";
import { FilterSheet } from "@/src/library/FilterSheet";
import { usePlanStore } from "@/src/plan/planStore";
import { DestructiveConfirm, EmptyState } from "@/src/ui/state";
import { getExerciseMeta } from "@/src/anatomy/gymGuide";
import { muscleAliasMatches } from "@/src/anatomy/search";
import { getBookmarks, getRecent } from "@/src/anatomy/storageLists";
import { ExerciseAnimation } from "@/src/components/ExerciseAnimation";
import { legacyPalette, LegacyPalette, GROUP_COLORS } from "@/src/anatomy/ui";
import { useTheme } from "@/src/theme/ThemeContext";

/** The shipped version, straight from app.json. Never hand-typed in a screen. */
const APP_VERSION = Constants.expoConfig?.version ?? "—";
import { usePremium } from "@/src/premium/PremiumContext";
import { PremiumGate } from "@/src/premium/PremiumGate";
import { gate } from "@/src/premium/entitlement";
import { MANUAL_APPLE_REVOCATION_COPY, useAuth } from "@/src/auth/AuthContext";
import { FLAGS } from "@/src/config/featureFlags";
import { ThemeSwitcher } from "@/src/ui/ThemeSwitcher";
import { LiquidTouchableOpacity as TouchableOpacity } from "@/src/ui/LiquidTouchableOpacity";
import { LiquidSheen } from "@/src/ui/GlassSurface";
import { PremiumDiscoveryCard } from "@/src/premium/PremiumDiscovery";

type LibSeg = "exercises" | "muscles" | "learn" | "account";

const SEG_LABELS: Record<LibSeg, string> = {
  exercises: "Exercises",
  muscles: "Muscles",
  learn: "Learn",
  account: "Account",
};

/** Derived from the catalogue, never hardcoded in user-facing copy. */
const CATALOGUE_COUNT = catalogIntegrity().count;

export default function LibraryScreen() {
  const insets = useSafeAreaInsets();
  const advancedOn = !!usePlanStore((s) => s.answers.advanced);
  const router = useRouter();
  const { user, logout, deleteAccount } = useAuth();
  const { resolution } = usePremium();
  // One gating contract — the Library never re-derives entitlement rules.
  const musclesDecision = gate("library.muscles", resolution);
  const learnDecision = gate("library.learn", resolution);
  const { mode } = useTheme();
  const T = useMemo(() => legacyPalette(mode), [mode]);
  const styles = useMemo(() => makeStyles(T), [T]);
  const w = useWorkout();
  const [query, setQuery] = useState("");
  const [seg, setSeg] = useState<LibSeg>(FLAGS.libraryExercises ? "exercises" : "muscles");
  const [filters, setFilters] = useState<CatalogFilters>({});
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [signOutGuard, setSignOutGuard] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [recent, setRecent] = useState<string[]>([]);
  const [bookmarks, setBookmarks] = useState<string[]>([]);

  /**
   * Signing out while a workout is being logged needs an explicit confirmation:
   * the session stays on this device, scoped to this profile, and is simply not
   * visible to whoever signs in next.
   */
  const confirmLogout = useCallback(() => {
    if (w.session !== null) {
      setSignOutGuard(true);
      return;
    }
    if (Platform.OS === "web") {
      // eslint-disable-next-line no-alert
      if (window.confirm("Log out of Muscle Map?")) logout();
      return;
    }
    Alert.alert("Log out", "Log out of Muscle Map?", [
      { text: "Cancel", style: "cancel" },
      { text: "Log Out", style: "destructive", onPress: () => logout() },
    ]);
  }, [logout, w.session]);

  const runDelete = useCallback(async () => {
    const res = await deleteAccount();
    if (res.ok) {
      // On success AuthProvider has already cleared session; the root layout
      // will redirect to /login. Only when automatic Apple revocation could not be
      // verified do we show the manual-revocation guidance — never otherwise.
      const message = res.manualAppleRevocation
        ? MANUAL_APPLE_REVOCATION_COPY
        : "Your account has been deleted.";
      if (Platform.OS === "web") {
        // eslint-disable-next-line no-alert
        window.alert(message);
      } else if (res.manualAppleRevocation) {
        Alert.alert("Account deleted", MANUAL_APPLE_REVOCATION_COPY);
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
      if (window.confirm("Delete your Muscle Map account?")) step2();
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

  // Search + filters run locally over the real catalogue: no network call is made
  // to browse, and results are deterministic.
  const results = useMemo(() => queryCatalogue(query, filters), [query, filters]);
  const activeFilters = activeFilterCount(filters);

  /**
   * Recent exercises come only from this owner's verified local History. An owner
   * with no History sees no "recent" section at all — nothing is fabricated.
   */
  const recentExercises = useMemo(() => {
    const ids: string[] = [];
    for (const workout of w.history) {
      for (const e of workout.exercises) {
        if ((e.idSpace ?? "anatomy") !== "anatomy") continue;
        if (!ids.includes(e.exerciseId) && getCatalogExercise(e.exerciseId)) ids.push(e.exerciseId);
      }
      if (ids.length >= 6) break;
    }
    return ids.slice(0, 6);
  }, [w.history]);

  const open = (n: string) => setSelected(n);
  const closeSheet = () => {
    setSelected(null);
    refresh();
  };

  return (
    <View style={styles.root}>
      <View style={{ paddingTop: insets.top + 12, paddingHorizontal: 18 }}>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
          <Text style={styles.h1}>Library</Text>
        </View>
        <Text style={styles.sub}>Exercises · muscle guide · learn · account</Text>
        {FLAGS.libraryExercises && (
          <View style={styles.libSeg}>
            {(["exercises", "muscles", "learn", "account"] as LibSeg[]).map((s) => {
              const isLocked =
                (s === "muscles" && musclesDecision !== "allow") || (s === "learn" && learnDecision !== "allow");
              return (
                <TouchableOpacity
                  key={s}
                  style={[styles.libSegBtn, seg === s && styles.libSegActive]}
                  onPress={() => setSeg(s)}
                  accessibilityRole="tab"
                  accessibilityState={{ selected: seg === s }}
                  accessibilityLabel={isLocked ? `${SEG_LABELS[s]}, Premium` : SEG_LABELS[s]}
                  testID={`lib-seg-${s}`}
                >
                  <Ionicons
                    name={s === "muscles" ? "body-outline" : s === "exercises" ? "barbell-outline" : s === "learn" ? "school-outline" : "person-circle-outline"}
                    size={15}
                    color={seg === s ? T.accent : T.textDim}
                  />
                  <Text style={[styles.libSegText, seg === s && styles.libSegTextActive]}>{SEG_LABELS[s]}</Text>
                  {isLocked && <Ionicons name="lock-closed" size={10} color={seg === s ? T.accent : T.textFaint} style={{ marginLeft: 3 }} />}
                </TouchableOpacity>
              );
            })}
          </View>
        )}
        {(seg === "exercises" || (seg === "muscles" && musclesDecision === "allow")) && (
          <View style={styles.search}>
            <LiquidSheen tone="neutral" />
            <Ionicons name="search" size={18} color={T.textFaint} />
            <TextInput
              style={styles.searchInput}
              placeholder={seg === "exercises" ? searchPlaceholder(CATALOGUE_COUNT) : "Search muscles…"}
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
        )}
      </View>

      {((seg === "muscles" && musclesDecision !== "allow") || (seg === "learn" && learnDecision !== "allow")) ? (
        <PremiumGate surface={seg === "learn" ? "library.learn" : "library.muscles"}>
          <View />
        </PremiumGate>
      ) : (
      <ScrollView contentContainerStyle={{ padding: 18, paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
        {seg === "muscles" && (
          <>
            {query.length === 0 && bookmarks.length > 0 && (
              <Pills title="Bookmarked" icon="bookmark" data={bookmarks} onPress={open} styles={styles} T={T} />
            )}
            {query.length === 0 && recent.length > 0 && (
              <Pills title="Recently Viewed" icon="time-outline" data={recent} onPress={open} styles={styles} T={T} />
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
                          <Text style={styles.rowName}>{info?.label || prettyName(n)}</Text>
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
            <View style={styles.filterRow}>
              <TouchableOpacity
                style={[styles.filterBtn, activeFilters > 0 && styles.filterBtnActive]}
                onPress={() => setFiltersOpen(true)}
                accessibilityRole="button"
                accessibilityLabel={
                  activeFilters > 0 ? `Filters, ${activeFilters} applied` : "Filters, none applied"
                }
                testID="lib-filters"
              >
                <Ionicons name="options-outline" size={15} color={activeFilters > 0 ? T.accent : T.text} />
                <Text style={[styles.filterBtnText, activeFilters > 0 && { color: T.accent }]}>
                  {activeFilters > 0 ? `Filters · ${activeFilters}` : "Filters"}
                </Text>
              </TouchableOpacity>
              <Text style={styles.resultCount} accessibilityLiveRegion="polite" testID="lib-result-count">
                {query.trim()
                  ? resultCountLabel(results.length, query.trim())
                  : `${results.length} of ${CATALOGUE_COUNT} exercises`}
              </Text>
            </View>

            {recentExercises.length > 0 && !query.trim() && activeFilters === 0 && (
              <View style={{ marginBottom: 16 }} testID="lib-recent">
                <Text style={styles.groupTitle}>Recent</Text>
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 8 }}>
                  {recentExercises.map((id) => (
                    <TouchableOpacity
                      key={id}
                      style={styles.recentChip}
                      onPress={() => router.push(`/exercise/${id}`)}
                      testID={`lib-recent-${id}`}
                    >
                      <Text style={styles.recentChipText}>{getCatalogExercise(id)?.name}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            )}

            {results.length === 0 ? (
              <View style={{ paddingVertical: 12 }} testID="lib-no-results">
                <EmptyState
                  icon="search-outline"
                  title={query.trim() ? "No matches" : "No exercises match these filters"}
                  body={query.trim() ? noMatchCopy(query.trim()) : "Remove a filter to see more of the catalogue."}
                  primary={
                    activeFilters > 0
                      ? { label: "Clear all filters", onPress: () => setFilters({}), testID: "lib-clear-filters" }
                      : undefined
                  }
                  secondary={
                    query.trim()
                      ? { label: "Clear search", onPress: () => setQuery(""), testID: "lib-clear-search" }
                      : undefined
                  }
                />
              </View>
            ) : (
              results.map((e) => {
                const meta = getExerciseMeta(e.id);
                return (
                  <TouchableOpacity
                    key={e.id}
                    style={styles.row}
                    onPress={() => router.push(`/exercise/${e.id}`)}
                    accessibilityRole="button"
                    accessibilityLabel={`${e.name}, ${e.equipment}, ${(e.primaryMuscles || []).join(", ")}`}
                    testID={`lib-ex-${e.id}`}
                  >
                    <View style={{ marginRight: 12 }}>
                      <ExerciseAnimation
                        exerciseId={e.id}
                        exerciseName={e.name}
                        variant="thumb"
                        size={36}
                        fallback={
                          <View style={[styles.exIcon, { backgroundColor: T.accent + "1A", marginRight: 0 }]}>
                            <Ionicons name={meta.icon as any} size={18} color={T.accent} />
                          </View>
                        }
                      />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.rowName}>{e.name}</Text>
                      <Text style={styles.rowFn} numberOfLines={1}>
                        {e.equipment} · {(e.primaryMuscles || []).join(", ") || e.movementPattern}
                      </Text>
                    </View>
                    <Ionicons name="chevron-forward" size={18} color={T.textFaint} />
                  </TouchableOpacity>
                );
              })
            )}

            <FilterSheet
              visible={filtersOpen}
              filters={filters}
              query={query}
              onChange={setFilters}
              onClear={() => setFilters({})}
              onClose={() => setFiltersOpen(false)}
            />
          </>
        )}

        {/* Account */}
        {seg === "account" && (
          <View style={styles.about}>
            <Text style={styles.aboutTitle}>Appearance</Text>
            <ThemeSwitcher />
            {/* Held back until entitlement resolves, so a subscriber never sees
                a Premium pitch on their own Account screen. */}
            {!resolution.access && resolution.state === "ready" ? (
              <View style={{ marginTop: 18 }}>
                <PremiumDiscoveryCard
                  compact
                  onPress={() => router.push("/(tabs)/coach")}
                  testID="account-premium-entry"
                />
              </View>
            ) : null}
            <Text style={[styles.aboutTitle, { marginTop: 22 }]}>Account</Text>
            <View style={styles.linkList}>
              {/* Training days and Advanced Lifter Mode are edited together, because the
                  mode is a constraint on how many days are selected. */}
              <TouchableOpacity
                style={styles.linkRow}
                onPress={() => router.push({ pathname: "/(tabs)/plan", params: { edit: "days" } })}
                accessibilityRole="button"
                accessibilityLabel={`Training days and Advanced Lifter Mode, currently ${advancedOn ? "on" : "off"}`}
                testID="edit-training-days"
              >
                <Ionicons name="calendar-outline" size={18} color={T.accent} />
                <Text style={styles.linkRowText}>Training days &amp; Advanced Lifter Mode</Text>
                <Text style={[styles.linkRowText, { flex: 0, color: T.textDim }]}>{advancedOn ? "On" : "Off"}</Text>
                <Ionicons name="chevron-forward" size={16} color={T.textFaint} />
              </TouchableOpacity>
              {!user ? (
                <TouchableOpacity style={styles.linkRow} onPress={() => router.push("/login")} testID="signin-btn">
                  <Ionicons name="log-in-outline" size={18} color={T.accent} />
                  <Text style={[styles.linkRowText, { color: T.accent }]}>Sign In or Create Account</Text>
                  <Ionicons name="chevron-forward" size={16} color={T.textFaint} />
                </TouchableOpacity>
              ) : user.is_guest ? (
                <>
                  <View style={styles.linkRow} testID="account-info">
                    <LiquidSheen tone="neutral" />
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
                    <LiquidSheen tone="neutral" />
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

            <Text style={[styles.aboutTitle, { marginTop: 22 }]}>About</Text>
            <Text style={styles.aboutText}>
              Muscle Map — explore a life-size 3D muscle model with 270 named structures,
              build a personalized weekly workout plan, and track your training.
            </Text>
            {/* Read from the app config rather than typed here, so the About
                screen can never disagree with the version that shipped. */}
            <Text style={styles.version}>v{APP_VERSION} · Today · Workout · Coach · Explore · Library</Text>

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

        {/* Learn */}
        {seg === "learn" && (
          <View>
            <Text style={styles.h1Small}>Guided anatomy lessons</Text>
            {LESSONS.map((l, i) => (
              <TouchableOpacity
                key={l.id}
                style={styles.lessonCard}
                onPress={() => router.push(`/lesson/${l.id}`)}
                testID={`lesson-${l.id}`}
              >
                <View style={styles.lessonIcon}>
                  <Ionicons name={l.icon as any} size={22} color={T.accent} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.lessonNumText}>Lesson {i + 1}</Text>
                  <Text style={styles.rowName}>{l.title}</Text>
                  <Text style={styles.rowFn}>{l.subtitle}</Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={T.textFaint} />
              </TouchableOpacity>
            ))}
          </View>
        )}
      </ScrollView>
      )}

      <Modal visible={!!selected} transparent animationType="slide" onRequestClose={closeSheet}>
        <Pressable style={styles.backdrop} onPress={closeSheet} />
        <View style={styles.modalBottom}>{selected && <MuscleSheet nodeName={selected} onClose={closeSheet} />}</View>
      </Modal>

      <DestructiveConfirm
        visible={signOutGuard}
        title="Sign out with a workout in progress?"
        body="Your logged sets stay saved on this device for this profile. They will not be visible to another profile, and signing back in brings them back. Your Plan and History are unaffected."
        confirmLabel="Sign out"
        cancelLabel="Keep logging"
        onConfirm={() => {
          setSignOutGuard(false);
          logout();
        }}
        onCancel={() => setSignOutGuard(false)}
        testID="signout-active-guard"
      />
    </View>
  );
}

function Pills({ title, icon, data, onPress, styles, T }: { title: string; icon: any; data: string[]; onPress: (n: string) => void; styles: any; T: LegacyPalette }) {
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

const makeStyles = (T: LegacyPalette) => StyleSheet.create({
  root: { flex: 1, backgroundColor: T.bg },
  h1: { color: T.text, fontSize: 26, fontWeight: "800" },
  sub: { color: T.textDim, fontSize: 13, marginTop: 2 },
  search: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: T.surface, borderRadius: 22, paddingHorizontal: 12, height: 44, marginTop: 14 },
  searchInput: { flex: 1, color: T.text, fontSize: 15 },
  libSeg: { flexDirection: "row", backgroundColor: "transparent", padding: 0, gap: 3, marginTop: 14 },
  // Page selection is an accent outline on an unchanged fill. Every selector
  // keeps a transparent border at rest so selecting never shifts its content.
  libSegBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 5, minHeight: 44, paddingHorizontal: 3, borderRadius: 22, borderWidth: 1.5, borderColor: "transparent" },
  libSegActive: { borderColor: T.accent },
  libSegText: { color: T.textDim, fontSize: 13, fontWeight: "700" },
  libSegTextActive: { color: T.accent },
  gbChip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999, backgroundColor: T.surfaceHi, borderWidth: 1.5, borderColor: "transparent" },
  gbChipActive: { borderColor: T.accent },
  gbChipText: { color: T.text, fontSize: 13, fontWeight: "700" },
  diffChip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999, backgroundColor: T.surfaceHi, borderWidth: 1.5, borderColor: "transparent" },
  diffChipActive: { borderColor: T.accent },
  diffChipText: { color: T.textDim, fontSize: 12, fontWeight: "700" },
  diffChipTextActive: { color: T.accent },
  exIcon: { width: 36, height: 36, borderRadius: 22, alignItems: "center", justifyContent: "center", marginRight: 12 },
  groupCount: { color: T.textFaint, fontSize: 12, fontWeight: "700", marginLeft: "auto" },
  groupHead: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 8 },
  gdot: { width: 10, height: 10, borderRadius: 5 },
  groupTitle: { color: T.text, fontSize: 17, fontWeight: "800" },
  row: { flexDirection: "row", alignItems: "center", backgroundColor: T.surface, borderRadius: 22, paddingHorizontal: 14, paddingVertical: 12, marginBottom: 8 },
  rowName: { color: T.text, fontSize: 15, fontWeight: "600" },
  rowFn: { color: T.textFaint, fontSize: 12, marginTop: 2 },
  pill: { backgroundColor: T.surfaceHi, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 9 },
  pillText: { color: T.text, fontSize: 13, fontWeight: "600" },
  filterRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 14, gap: 12 },
  filterBtn: {
    flexDirection: "row", alignItems: "center", gap: 6, minHeight: 44, paddingHorizontal: 14,
    borderRadius: 999, borderWidth: 1.5, borderColor: "transparent", backgroundColor: T.surface,
  },
  filterBtnActive: { borderColor: T.accent },
  filterBtnText: { color: T.text, fontSize: 13, fontWeight: "700" },
  resultCount: { color: T.textDim, fontSize: 12.5, fontWeight: "600", flexShrink: 1, textAlign: "right" },
  recentChip: {
    minHeight: 44, justifyContent: "center", paddingHorizontal: 14, borderRadius: 999,
    backgroundColor: T.surface,
  },
  recentChipText: { color: T.text, fontSize: 13, fontWeight: "600" },
  empty: { color: T.textDim, fontSize: 14, textAlign: "center", marginTop: 40 },
  about: { marginTop: 6, paddingTop: 16, borderTopWidth: 1, borderTopColor: T.border },
  aboutTitle: { color: T.textDim, fontSize: 12, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8 },
  aboutText: { color: T.textDim, fontSize: 14, lineHeight: 21 },
  version: { color: T.textFaint, fontSize: 12, marginTop: 12 },
  linkList: { marginTop: 16, gap: 8 },
  linkRow: { flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: T.surface, borderRadius: 22, paddingHorizontal: 14, paddingVertical: 13 },
  h1Small: { color: T.textDim, fontSize: 12, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 12 },
  lessonCard: {
    flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: T.surface, 
    borderRadius: 22, padding: 14, marginBottom: 10,
  },
  lessonIcon: { width: 44, height: 44, borderRadius: 22, backgroundColor: T.surfaceHi, alignItems: "center", justifyContent: "center" },
  lessonNumText: { color: T.accent, fontSize: 10, fontWeight: "800", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 2 },
  linkRowText: { flex: 1, color: T.text, fontSize: 15, fontWeight: "600" },
  accountEmail: { color: T.textFaint, fontSize: 12, marginTop: 1 },
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.6)" },
  modalBottom: { position: "absolute", left: 0, right: 0, bottom: 0 },
});
