import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  LayoutAnimation,
  Platform,
  UIManager,
  useWindowDimensions,
  ActivityIndicator,
  Pressable,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";

import { legacyPalette, LegacyPalette, GROUP_COLORS } from "./ui";
import { getMuscleInfo } from "./muscleData";
import { prettyName, GYM_GROUPS } from "./groups";
import { getExercise } from "./exercises";
import { getGuide, getExerciseMeta, MUSCLE_SUMMARY } from "./gymGuide";
import { addRecent, isBookmarked, toggleBookmark } from "./storageLists";
import { askCoach } from "./coachApi";
import { ExerciseAnimation } from "@/src/components/ExerciseAnimation";
import { useTheme } from "@/src/theme/ThemeContext";
import { LiquidTouchableOpacity as TouchableOpacity } from "@/src/ui/LiquidTouchableOpacity";

if (Platform.OS === "android" && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

// This sheet has many small sub-components that all read the shared `T` palette
// and `styles`. To flip Day/Night without threading props through every one,
// we keep module-scoped `T`/`styles` that the top-level MuscleSheet sets (via
// useThemedStyles) at the start of each render — synchronous, single-instance.
let T: LegacyPalette = legacyPalette("night");
const _styleCache: Record<string, ReturnType<typeof makeStyles>> = {};
let styles = (_styleCache.night = makeStyles(T));

function useThemedStyles() {
  const { mode } = useTheme();
  T = legacyPalette(mode);
  if (!_styleCache[mode]) _styleCache[mode] = makeStyles(T);
  styles = _styleCache[mode];
}

type Props = {
  nodeName: string;
  onClose?: () => void;
  onExercise?: (id: string) => void;
  showHandle?: boolean;
  fill?: boolean;
  /**
   * "preview" opens on the compact card — group, function, antagonists and the
   * three training numbers — with the full guide one tap away. "full" is the
   * whole reference, and is what a screen that IS the muscle detail wants.
   */
  variant?: "preview" | "full";
};

type PreviewTab = "overview" | "training" | "exercises";

const PREVIEW_TABS: { key: PreviewTab; label: string }[] = [
  { key: "overview", label: "Overview" },
  { key: "training", label: "Training" },
  { key: "exercises", label: "Exercises" },
];

// The guide states these in full sentences. The preview has three columns, so
// each is shortened by rule — never re-authored, so the numbers cannot drift.
const compactFrequency = (v: string) => v.replace(/\s*sessions?\s*\/\s*week/i, "× / week");
const compactRecovery = (v: string) => v.replace(/\s*hours?/i, " h");
const compactVolume = (v: string) => v.replace(/\s*sets?/i, "");
const compactReps = (v: string) => v.replace(/\s*reps?/i, "");

const muscleLabel = (n: string) => getMuscleInfo(n)?.label || prettyName(n);

export function MuscleSheet({ nodeName, onClose, onExercise, showHandle = true, fill = false, variant = "full" }: Props) {
  useThemedStyles();
  const router = useRouter();
  const { height } = useWindowDimensions();
  const info = getMuscleInfo(nodeName);
  const title = info?.label || prettyName(nodeName);
  const groupKey = info?.group;
  const groupLabel = groupKey ? GYM_GROUPS[groupKey]?.label : "Anatomical structure";
  const accent = groupKey ? GROUP_COLORS[groupKey] || T.accent : T.accent;
  const guide = getGuide(groupKey);
  // Only a written summary earns the subtitle line — falling back to `fn` here
  // printed the same sentence twice, once under the title and once as the
  // function.
  const summary = MUSCLE_SUMMARY[nodeName] || (variant === "preview" ? "" : info?.fn || "");
  const exerciseCount = info?.exercises.length ?? 0;
  // The stored function line carries its own one-phrase gloss after a dash. The
  // gloss is the subtitle, so the function row shows the clause without it.
  const mainFunction = (info?.fn || "").split("—")[0].trim().replace(/,$/, "");
  const antagonists = (info?.antagonist || "").replace(/\s*\/\s*/g, "  ·  ");

  const [marked, setMarked] = useState(false);
  const [anatomyOpen, setAnatomyOpen] = useState(true);
  const [tab, setTab] = useState<PreviewTab>("overview");
  // Only one exercise card animates at a time.
  const [animId, setAnimId] = useState<string | null>(null);

  useEffect(() => {
    addRecent(nodeName);
    isBookmarked(nodeName).then(setMarked);
  }, [nodeName]);

  const onToggleBookmark = async () => setMarked(await toggleBookmark(nodeName));

  const askAtlas = () => {
    onClose?.();
    router.push({
      pathname: "/(tabs)/coach",
      params: { q: `Tell me about the ${title} — its function and the best exercises to train it.` },
    });
  };

  return (
    <View style={[styles.card, fill ? { flex: 1 } : { maxHeight: height * 0.9 }]} testID="muscle-detail">
      {showHandle && <View style={styles.handle} />}

      <View style={styles.headerRow}>
        <View style={[styles.tag, { backgroundColor: accent + "22", borderColor: accent + "55" }]}>
          <Text style={[styles.tagText, { color: accent }]}>{groupLabel.toUpperCase()}</Text>
        </View>
        <View style={{ flex: 1 }} />
        <TouchableOpacity onPress={onToggleBookmark} style={styles.iconBtn} testID="muscle-bookmark">
          <Ionicons name={marked ? "bookmark" : "bookmark-outline"} size={20} color={marked ? T.accent : T.textDim} />
        </TouchableOpacity>
        {onClose && (
          <TouchableOpacity onPress={onClose} style={styles.iconBtn} testID="muscle-detail-close">
            <Ionicons name="close" size={20} color={T.textDim} />
          </TouchableOpacity>
        )}
      </View>

      <Text style={styles.title} testID="muscle-detail-title">
        {title}
      </Text>
      {!!summary && <Text style={styles.summary}>{summary}</Text>}

      {variant === "preview" ? (
        <>
          {/* Three questions, three tabs: what it is, how to train it, what to
              train it with. The old sheet answered all three in one scroll, and
              the second two were below the fold on every phone. */}
          {/* The subtitle carries the gap when there is one; a muscle with no
              written summary needs it here instead. */}
          {!summary && <View style={{ height: 14 }} />}
          <View style={styles.tabBar}>
            {PREVIEW_TABS.map((tb) => {
              const on = tab === tb.key;
              return (
                <Pressable
                  key={tb.key}
                  style={[styles.tabBtn, on && { borderColor: T.accent }]}
                  onPress={() => setTab(tb.key)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: on }}
                  accessibilityLabel={tb.label}
                  testID={`muscle-tab-${tb.key}`}
                >
                  <Text style={[styles.tabText, { color: on ? T.accent : T.textDim }]}>{tb.label}</Text>
                </Pressable>
              );
            })}
          </View>

          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 22, gap: 14 }}>
            {tab === "overview" && (
              <>
                <View style={styles.previewCard}>
                  <View style={styles.fnHead}>
                    <View style={[styles.fnIcon, { backgroundColor: T.accent + "22" }]}>
                      <Ionicons name="flash" size={20} color={T.accent} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.previewCaps, { color: T.accent }]}>MAIN FUNCTION</Text>
                      <Text style={styles.fnText}>{mainFunction || "—"}</Text>
                    </View>
                  </View>
                  <FactRow label="Origin" value={info?.origin} />
                  <FactRow label="Insertion" value={info?.insertion} />
                  <FactRow label="Antagonists" value={antagonists} last />
                </View>

                <View>
                  <Text style={styles.glanceCaps}>TRAINING AT A GLANCE</Text>
                  <View style={styles.previewCard}>
                    {guide ? (
                      <>
                        <View style={styles.previewStats}>
                          <PreviewStat icon="repeat" value={compactFrequency(guide.frequency)} label="Frequency" />
                          <View style={styles.previewStatDivider} />
                          <PreviewStat icon="time-outline" value={compactRecovery(guide.recovery)} label="Recovery" />
                          <View style={styles.previewStatDivider} />
                          <PreviewStat icon="layers-outline" value={compactVolume(guide.weeklyVolume)} label="Sets" />
                        </View>
                        <View style={styles.previewRule} />
                        <View style={styles.repBand}>
                          <RepCell color="#FF6B5E" label="Strength" value={compactReps(guide.repRanges.strength)} />
                          <View style={styles.previewStatDivider} />
                          <RepCell color="#3DDC97" label="Hypertrophy" value={compactReps(guide.repRanges.hypertrophy)} />
                          <View style={styles.previewStatDivider} />
                          <RepCell color="#5EA8FF" label="Endurance" value={compactReps(guide.repRanges.endurance)} />
                        </View>
                      </>
                    ) : (
                      <Text style={styles.emptyTab}>No training guidance is recorded for this structure.</Text>
                    )}
                  </View>
                </View>

                {exerciseCount > 0 && (
                  <Pressable
                    style={styles.previewPrimary}
                    onPress={() => setTab("exercises")}
                    accessibilityRole="button"
                    accessibilityLabel={`View the ${exerciseCount} best exercises for the ${title}`}
                    testID="muscle-exercise-count"
                  >
                    <Text style={styles.previewPrimaryText}>
                      View {exerciseCount} best exercise{exerciseCount === 1 ? "" : "s"}
                    </Text>
                    <Ionicons name="chevron-forward" size={18} color={T.bg} />
                  </Pressable>
                )}
              </>
            )}

            {tab === "training" && (
              <>
                {guide ? (
                  <>
                    <View style={styles.previewCard}>
                      <View style={{ padding: 14 }}>
                        <Text style={[styles.previewCaps, { color: T.accent }]}>WHY YOU TRAIN IT</Text>
                        <Text style={styles.fnText}>{guide.purpose}</Text>
                      </View>
                    </View>

                    {guide.mistakes.length > 0 && (
                      <View style={styles.previewCard}>
                        <View style={{ padding: 14, gap: 10 }}>
                          <Text style={[styles.previewCaps, { color: T.secondary }]}>COMMON MISTAKES</Text>
                          {guide.mistakes.map((m) => (
                            <View key={m} style={styles.listRow}>
                              <Ionicons name="close-circle" size={16} color={T.primary} style={{ marginTop: 2 }} />
                              <Text style={styles.listText}>{m}</Text>
                            </View>
                          ))}
                        </View>
                      </View>
                    )}

                    {guide.tips.length > 0 && (
                      <View style={styles.previewCard}>
                        <View style={{ padding: 14, gap: 10 }}>
                          <Text style={[styles.previewCaps, { color: "#3DDC97" }]}>COACH TIPS</Text>
                          {guide.tips.map((tip) => (
                            <View key={tip} style={styles.listRow}>
                              <Ionicons name="checkmark-circle" size={16} color="#3DDC97" style={{ marginTop: 2 }} />
                              <Text style={styles.listText}>{tip}</Text>
                            </View>
                          ))}
                        </View>
                      </View>
                    )}
                  </>
                ) : (
                  <Text style={styles.emptyTab}>No training guidance is recorded for this structure.</Text>
                )}
              </>
            )}

            {tab === "exercises" && (
              <>
                {info && info.exercises.length > 0 ? (
                  info.exercises.map((id) => (
                    <ExerciseCard
                      key={id}
                      id={id}
                      accent={accent}
                      onPress={() => onExercise?.(id)}
                      animPlaying={animId === id}
                      onToggleAnim={() => setAnimId((cur) => (cur === id ? null : id))}
                    />
                  ))
                ) : (
                  <Text style={styles.emptyTab}>No exercises in the catalogue name this muscle as a prime mover.</Text>
                )}
                <AiInsight nodeName={nodeName} title={title} groupKey={groupKey} accent={accent} />
              </>
            )}

            <Pressable
              style={styles.previewAsk}
              onPress={askAtlas}
              accessibilityRole="button"
              accessibilityLabel={`Ask Atlas Coach about the ${title}`}
              testID="muscle-ask-coach"
            >
              <Ionicons name="sparkles-outline" size={16} color={T.accent} />
              <Text style={styles.previewAskText}>Ask Atlas Coach</Text>
            </Pressable>

            {/* Citations — Guideline 1.4.1. Present on every tab, not buried
                behind one of them. */}
            <Pressable style={styles.srcRow} onPress={() => router.push("/references")} testID="muscle-view-sources">
              <Ionicons name="library-outline" size={14} color={T.textFaint} />
              <Text style={styles.srcText}>
                Anatomy and recovery data sourced from Gray&apos;s Anatomy, ACSM, NIH/NCBI and Kenhub.
              </Text>
              <Text style={styles.srcCta}>View sources</Text>
            </Pressable>
          </ScrollView>
        </>
      ) : (
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 28 }} style={{ flex: fill ? 1 : undefined }}>
        {/* ---- Anatomy (collapsible) ---- */}
        <Card>
          <TouchableOpacity
            style={styles.cardHead}
            onPress={() => {
              LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
              setAnatomyOpen((o) => !o);
            }}
            activeOpacity={0.7}
            testID="anatomy-toggle"
          >
            <View style={styles.cardHeadLeft}>
              <Ionicons name="body" size={18} color={accent} />
              <Text style={styles.cardTitle}>Anatomy</Text>
            </View>
            <Ionicons name={anatomyOpen ? "chevron-up" : "chevron-down"} size={20} color={T.textDim} />
          </TouchableOpacity>
          {anatomyOpen && (
            <View style={{ marginTop: 8 }}>
              <Field icon="flash" label="Function" value={info?.fn || "—"} accent={accent} />
              <Field icon="arrow-up-circle" label="Origin" value={info?.origin || "—"} accent={accent} />
              <Field icon="arrow-down-circle" label="Insertion" value={info?.insertion || "—"} accent={accent} />
              <Field icon="swap-horizontal" label="Antagonist" value={info?.antagonist || "—"} accent={accent} last />
            </View>
          )}
        </Card>

        {/* ---- Gym Guide ---- */}
        {guide && (
          <Card>
            <View style={styles.cardHead}>
              <View style={styles.cardHeadLeft}>
                <Ionicons name="barbell" size={18} color={accent} />
                <Text style={styles.cardTitle}>Gym Guide</Text>
              </View>
            </View>
            <Text style={styles.purpose}>{guide.purpose}</Text>
            <View style={styles.statRow}>
              <Stat icon="repeat" label="Frequency" value={guide.frequency} />
              <Stat icon="time" label="Recovery" value={guide.recovery} />
              <Stat icon="layers" label="Volume" value={guide.weeklyVolume} />
            </View>
            <Text style={styles.subLabel}>Best Rep Ranges</Text>
            <RepRow color="#FF6B5E" label="Strength" value={guide.repRanges.strength} />
            <RepRow color="#3DDC97" label="Hypertrophy" value={guide.repRanges.hypertrophy} />
            <RepRow color="#5EA8FF" label="Endurance" value={guide.repRanges.endurance} />
          </Card>
        )}

        {/* ---- Common Mistakes ---- */}
        {guide && guide.mistakes.length > 0 && (
          <Card>
            <View style={styles.cardHead}>
              <View style={styles.cardHeadLeft}>
                <Ionicons name="warning" size={18} color={T.secondary} />
                <Text style={styles.cardTitle}>Common Mistakes</Text>
              </View>
            </View>
            {guide.mistakes.map((m) => (
              <View key={m} style={styles.listRow}>
                <Ionicons name="close-circle" size={16} color={T.primary} style={{ marginTop: 2 }} />
                <Text style={styles.listText}>{m}</Text>
              </View>
            ))}
          </Card>
        )}

        {/* ---- Coach Tips ---- */}
        {guide && guide.tips.length > 0 && (
          <Card>
            <View style={styles.cardHead}>
              <View style={styles.cardHeadLeft}>
                <Ionicons name="bulb" size={18} color="#3DDC97" />
                <Text style={styles.cardTitle}>Coach Tips</Text>
              </View>
            </View>
            {guide.tips.map((tip) => (
              <View key={tip} style={styles.listRow}>
                <Ionicons name="checkmark-circle" size={16} color="#3DDC97" style={{ marginTop: 2 }} />
                <Text style={styles.listText}>{tip}</Text>
              </View>
            ))}
          </Card>
        )}

        {/* ---- Best Exercises (cards) ---- */}
        {info && info.exercises.length > 0 && (
          <View style={{ marginTop: 4 }}>
            <Text style={[styles.sectionHeading, { marginBottom: 10 }]}>Best Exercises</Text>
            {info.exercises.map((id) => (
              <ExerciseCard
                key={id}
                id={id}
                accent={accent}
                onPress={() => onExercise?.(id)}
                animPlaying={animId === id}
                onToggleAnim={() => setAnimId((cur) => (cur === id ? null : id))}
              />
            ))}
          </View>
        )}

        {/* ---- AI Coach Insight ---- */}
        <AiInsight nodeName={nodeName} title={title} groupKey={groupKey} accent={accent} />

        <TouchableOpacity style={styles.askBtn} onPress={askAtlas} testID="muscle-ask-coach">
          <Ionicons name="sparkles" size={16} color={T.bg} />
          <Text style={styles.askBtnText}>Chat with Atlas Coach</Text>
        </TouchableOpacity>

        {/* Citations — Guideline 1.4.1: sources for anatomical & recovery info */}
        <TouchableOpacity
          style={styles.srcRow}
          onPress={() => router.push("/references")}
          testID="muscle-view-sources"
        >
          <Ionicons name="library-outline" size={14} color={T.textFaint} />
          <Text style={styles.srcText}>
            Anatomy and recovery data sourced from Gray&apos;s Anatomy, ACSM, NIH/NCBI and Kenhub.
          </Text>
          <Text style={styles.srcCta}>View sources</Text>
        </TouchableOpacity>
      </ScrollView>
      )}
    </View>
  );
}

/* ----------------- sub components ----------------- */

function Card({ children }: { children: React.ReactNode }) {
  return <View style={styles.subCard}>{children}</View>;
}

function Field({ icon, label, value, accent, last }: { icon: any; label: string; value: string; accent: string; last?: boolean }) {
  return (
    <View style={[styles.field, !last && styles.fieldDivider]}>
      <View style={styles.fieldHead}>
        <Ionicons name={icon} size={15} color={accent} />
        <Text style={[styles.fieldLabel, { color: accent }]}>{label}</Text>
      </View>
      <Text style={styles.fieldValue}>{value}</Text>
    </View>
  );
}

function FactRow({ label, value, last }: { label: string; value?: string; last?: boolean }) {
  return (
    <View style={[styles.factRow, !last && styles.factDivider]} accessible accessibilityLabel={`${label}: ${value || "not recorded"}`}>
      <Text style={styles.factLabel}>{label}</Text>
      <Text style={styles.factValue}>{value ? value.replace(/\.$/, "") : "—"}</Text>
    </View>
  );
}

function RepCell({ color, label, value }: { color: string; label: string; value: string }) {
  return (
    <View style={styles.repCell} accessible accessibilityLabel={`${label}: ${value} reps`}>
      <View style={styles.repCellHead}>
        <View style={[styles.repDot, { backgroundColor: color }]} />
        <Text style={styles.repCellLabel}>{label}</Text>
      </View>
      <Text style={styles.repCellValue}>{value}</Text>
    </View>
  );
}

function PreviewStat({ icon, value, label }: { icon: any; value: string; label: string }) {
  return (
    <View style={styles.previewStat} accessible accessibilityLabel={`${label}: ${value}`}>
      <Ionicons name={icon} size={18} color={T.accent} />
      <Text style={styles.previewStatValue}>{value}</Text>
      <Text style={styles.previewStatLabel}>{label}</Text>
    </View>
  );
}

function Stat({ icon, label, value }: { icon: any; label: string; value: string }) {
  return (
    <View style={styles.stat}>
      <Ionicons name={icon} size={16} color={T.accent} />
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function RepRow({ color, label, value }: { color: string; label: string; value: string }) {
  return (
    <View style={styles.repRow}>
      <View style={[styles.repDot, { backgroundColor: color }]} />
      <Text style={styles.repLabel}>{label}</Text>
      <Text style={styles.repValue}>{value}</Text>
    </View>
  );
}

function Stars({ rating }: { rating: number }) {
  return (
    <View style={{ flexDirection: "row" }}>
      {[1, 2, 3, 4, 5].map((i) => (
        <Ionicons key={i} name={i <= rating ? "star" : "star-outline"} size={12} color={T.secondary} />
      ))}
    </View>
  );
}

function ExerciseCard({
  id,
  accent,
  onPress,
  animPlaying,
  onToggleAnim,
}: {
  id: string;
  accent: string;
  onPress: () => void;
  animPlaying: boolean;
  onToggleAnim: () => void;
}) {
  const ex = getExercise(id);
  const meta = getExerciseMeta(id);
  const [open, setOpen] = useState(false);
  if (!ex) return null;

  const toggle = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setOpen((o) => !o);
  };

  return (
    <View style={styles.exCard}>
      <TouchableOpacity style={styles.exTop} onPress={onPress} activeOpacity={0.8} testID={`ex-card-${id}`}>
        <ExerciseAnimation
          exerciseId={id}
          variant="card"
          size={46}
          playing={animPlaying}
          onTogglePlay={onToggleAnim}
          fallback={
            <View style={[styles.exIcon, { backgroundColor: accent + "22" }]}>
              <Ionicons name={meta.icon as any} size={22} color={accent} />
            </View>
          }
        />
        <View style={{ flex: 1 }}>
          <Text style={styles.exName}>{ex.name}</Text>
          <View style={styles.exMetaRow}>
            <Stars rating={meta.rating} />
            <View style={styles.dotSep} />
            <Text style={styles.exMeta}>{meta.difficulty}</Text>
            <View style={styles.dotSep} />
            <Text style={styles.exMeta}>{ex.equipment}</Text>
          </View>
        </View>
        <Ionicons name="chevron-forward" size={18} color={T.textFaint} />
      </TouchableOpacity>

      <TouchableOpacity style={styles.exExpand} onPress={toggle} testID={`ex-expand-${id}`}>
        <Text style={styles.exExpandText}>{open ? "Hide muscle contribution" : "Muscle contribution"}</Text>
        <Ionicons name={open ? "chevron-up" : "chevron-down"} size={16} color={T.accent} />
      </TouchableOpacity>

      {open && (
        <View style={styles.contribWrap}>
          {ex.primary.map((m) => (
            <Bar key={m} label={muscleLabel(m)} pct={100} color={T.primary} tag="Primary" />
          ))}
          {ex.secondary.map((m) => (
            <Bar key={m} label={muscleLabel(m)} pct={55} color={T.secondary} tag="Secondary" />
          ))}
        </View>
      )}
    </View>
  );
}

function Bar({ label, pct, color, tag }: { label: string; pct: number; color: string; tag: string }) {
  return (
    <View style={styles.barRow}>
      <View style={styles.barTop}>
        <Text style={styles.barLabel} numberOfLines={1}>
          {label}
        </Text>
        <Text style={[styles.barTag, { color }]}>{tag}</Text>
      </View>
      <View style={styles.barTrack}>
        <View style={[styles.barFill, { width: `${pct}%`, backgroundColor: color }]} />
      </View>
    </View>
  );
}

function AiInsight({ nodeName, title, groupKey, accent }: { nodeName: string; title: string; groupKey?: string; accent: string }) {
  const [state, setState] = useState<"idle" | "loading" | "done">("idle");
  const [text, setText] = useState("");

  const fallback = () => {
    const g = getGuide(groupKey);
    if (g) {
      return `Coach tip: train the ${title.toLowerCase()} about ${g.frequency.toLowerCase()}, aiming for ${g.weeklyVolume} and allowing ${g.recovery} of recovery. Prioritise ${g.repRanges.hypertrophy} for growth and full range of motion.`;
    }
    return "Train this muscle with controlled form, full range of motion, and progressive overload week to week.";
  };

  const generate = () => {
    setState("loading");
    setText("");
    let acc = "";
    askCoach(
      `Give one short, practical training insight (max 2 sentences) for a general gym-goer about the ${title}. Focus on weekly frequency, volume and recovery. Be specific and motivating.`,
      [],
      title,
      {
        onDelta: (d) => {
          acc += d;
          setText(acc);
          setState("loading");
        },
        onDone: () => {
          if (!acc.trim()) {
            setText(fallback());
          }
          setState("done");
        },
        onFail: () => {
          setText(fallback());
          setState("done");
        },
      },
    );
  };

  return (
    <View style={[styles.aiCard, { borderColor: accent + "44" }]}>
      <View style={styles.aiHead}>
        <View style={styles.aiBadge}>
          <Ionicons name="sparkles" size={14} color={T.bg} />
        </View>
        <Text style={styles.cardTitle}>AI Coach Insight</Text>
      </View>
      {state === "idle" ? (
        <>
          <Text style={styles.aiSub}>Get a personalised training insight for the {title.toLowerCase()}.</Text>
          <TouchableOpacity style={[styles.aiBtn, { backgroundColor: accent }]} onPress={generate} testID="ai-insight-btn">
            <Ionicons name="flash" size={15} color={T.bg} />
            <Text style={styles.aiBtnText}>Generate insight</Text>
          </TouchableOpacity>
        </>
      ) : (
        <View style={{ flexDirection: "row", gap: 8 }}>
          {state === "loading" && !text ? <ActivityIndicator color={accent} /> : null}
          <Text style={styles.aiText}>{text}</Text>
        </View>
      )}
    </View>
  );
}

function makeStyles(T: LegacyPalette) { return StyleSheet.create({
  card: {
    // Opaque, not the translucent card fill: this sheet sits over the Library
    // list, and a see-through panel put that list's rows behind its own text.
    backgroundColor: T.surfaceSolid,
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    paddingHorizontal: 18,
    paddingBottom: 8,
    paddingTop: 10,
  },
  handle: { alignSelf: "center", width: 42, height: 5, borderRadius: 3, backgroundColor: "rgba(120,160,220,0.25)", marginBottom: 10 },
  headerRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  tag: { alignSelf: "flex-start", paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999, borderWidth: 1 },
  tagText: { fontSize: 11.5, fontWeight: "800", letterSpacing: 0.7 },
  title: { color: T.text, fontSize: 30, fontWeight: "800", marginTop: 14, letterSpacing: -0.4 },
  // A bordered square, so the two controls read as controls without a fill
  // competing with the group chip beside them.
  iconBtn: {
    width: 40, height: 40, borderRadius: 12, alignItems: "center", justifyContent: "center",
    borderWidth: 1, borderColor: T.border, overflow: "hidden",
  },
  summary: { color: T.textDim, fontSize: 15, lineHeight: 22, marginTop: 6, marginBottom: 14 },

  // ---- preview variant ----
  // Selection is an accent outline over an unchanged fill — the same rule the
  // rest of the app uses, so the row never shifts when the tab changes.
  tabBar: { flexDirection: "row", gap: 4, backgroundColor: T.bg2, borderRadius: 16, padding: 4, marginBottom: 14 },
  tabBtn: {
    flex: 1, minHeight: 44, alignItems: "center", justifyContent: "center",
    borderRadius: 13, borderWidth: 1.5, borderColor: "transparent",
  },
  tabText: { fontSize: 14.5, fontWeight: "700" },

  previewCard: { backgroundColor: T.bg2, borderRadius: 18, borderWidth: 1, borderColor: T.border, overflow: "hidden" },
  previewCaps: { fontSize: 11.5, fontWeight: "800", textTransform: "uppercase", letterSpacing: 0.7 },
  previewRule: { height: 1, backgroundColor: T.border },
  fnHead: { flexDirection: "row", alignItems: "flex-start", gap: 12, padding: 14 },
  fnIcon: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center" },
  fnText: { color: T.text, fontSize: 15, lineHeight: 22, fontWeight: "500", marginTop: 6 },
  factRow: { flexDirection: "row", alignItems: "flex-start", gap: 16, paddingHorizontal: 14, paddingVertical: 13 },
  factDivider: { borderBottomWidth: 1, borderBottomColor: T.border },
  factLabel: { color: T.accent, fontSize: 14, fontWeight: "600", width: 96 },
  factValue: { flex: 1, color: T.text, fontSize: 14, lineHeight: 20, textAlign: "right" },
  glanceCaps: { color: T.textFaint, fontSize: 11.5, fontWeight: "800", textTransform: "uppercase", letterSpacing: 0.9, marginBottom: 8 },
  repBand: { flexDirection: "row", alignItems: "center", paddingVertical: 14 },
  repCell: { flex: 1, alignItems: "center", gap: 4 },
  repCellHead: { flexDirection: "row", alignItems: "center", gap: 6 },
  repCellLabel: { color: T.text, fontSize: 13.5, fontWeight: "600" },
  repCellValue: { color: T.textDim, fontSize: 14 },
  emptyTab: { color: T.textDim, fontSize: 14, lineHeight: 21, padding: 14 },
  previewStats: { flexDirection: "row", alignItems: "center", paddingVertical: 16 },
  previewStat: { flex: 1, alignItems: "center", gap: 5 },
  previewStatValue: { color: T.text, fontSize: 17, fontWeight: "800" },
  previewStatLabel: { color: T.textDim, fontSize: 12.5 },
  previewStatDivider: { width: 1, height: 46, backgroundColor: T.border },
  previewActions: { flexDirection: "row", gap: 10 },
  previewPrimary: {
    flexDirection: "row", gap: 8, backgroundColor: T.accent, borderRadius: 16, paddingVertical: 16,
    alignItems: "center", justifyContent: "center",
  },
  previewPrimaryText: { color: T.bg, fontSize: 15.5, fontWeight: "700" },
  previewSecondary: {
    flex: 1, borderRadius: 14, paddingVertical: 15, alignItems: "center", justifyContent: "center",
    borderWidth: 1.5, borderColor: T.accent, overflow: "hidden",
  },
  previewSecondaryText: { color: T.text, fontSize: 15.5, fontWeight: "700" },
  previewAsk: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, minHeight: 44 },
  previewAskText: { color: T.accent, fontSize: 15.5, fontWeight: "700" },
  subCard: { backgroundColor: T.bg2, borderRadius: 22, padding: 16, marginBottom: 12 },
  cardHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  cardHeadLeft: { flexDirection: "row", alignItems: "center", gap: 8 },
  cardTitle: { color: T.text, fontSize: 17, fontWeight: "800" },
  sectionHeading: { color: T.text, fontSize: 17, fontWeight: "800" },

  field: { paddingVertical: 10 },
  fieldDivider: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: T.border },
  fieldHead: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 3 },
  fieldLabel: { fontSize: 12, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.4 },
  fieldValue: { color: T.text, fontSize: 15, lineHeight: 21 },

  purpose: { color: T.text, fontSize: 15, lineHeight: 21, marginTop: 10, marginBottom: 14 },
  statRow: { flexDirection: "row", gap: 8, marginBottom: 16 },
  stat: { flex: 1, backgroundColor: T.surfaceHi, borderRadius: 22, paddingVertical: 12, alignItems: "center", gap: 4 },
  statValue: { color: T.text, fontSize: 13, fontWeight: "800", textAlign: "center" },
  statLabel: { color: T.textFaint, fontSize: 11 },
  subLabel: { color: T.textDim, fontSize: 12, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.4, marginBottom: 8 },
  repRow: { flexDirection: "row", alignItems: "center", paddingVertical: 6 },
  repDot: { width: 9, height: 9, borderRadius: 5, marginRight: 10 },
  repLabel: { color: T.text, fontSize: 14, fontWeight: "600", flex: 1 },
  repValue: { color: T.textDim, fontSize: 14, fontWeight: "700" },

  listRow: { flexDirection: "row", gap: 10, alignItems: "flex-start", paddingVertical: 6 },
  listText: { color: T.text, fontSize: 14, lineHeight: 20, flex: 1 },
  exCard: { backgroundColor: T.bg2, borderRadius: 22, marginBottom: 10, overflow: "hidden" },
  exTop: { flexDirection: "row", alignItems: "center", gap: 12, padding: 12 },
  exIcon: { width: 46, height: 46, borderRadius: 22, alignItems: "center", justifyContent: "center" },
  exName: { color: T.text, fontSize: 15, fontWeight: "700" },
  exMetaRow: { flexDirection: "row", alignItems: "center", gap: 7, marginTop: 4 },
  exMeta: { color: T.textDim, fontSize: 12, fontWeight: "600" },
  dotSep: { width: 3, height: 3, borderRadius: 2, backgroundColor: T.textFaint },
  exExpand: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 9, borderTopWidth: 1, borderTopColor: T.border },
  exExpandText: { color: T.accent, fontSize: 12, fontWeight: "700" },
  contribWrap: { paddingHorizontal: 14, paddingBottom: 14, paddingTop: 2, gap: 10 },
  barRow: { gap: 5 },
  barTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  barLabel: { color: T.text, fontSize: 13, fontWeight: "600", flex: 1, marginRight: 8 },
  barTag: { fontSize: 11, fontWeight: "700" },
  barTrack: { height: 8, borderRadius: 4, backgroundColor: T.surfaceHi, overflow: "hidden" },
  barFill: { height: 8, borderRadius: 4 },
  aiCard: { backgroundColor: T.bg2, borderRadius: 22, padding: 16, marginTop: 6, marginBottom: 8 },
  aiHead: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 8 },
  aiBadge: { width: 26, height: 26, borderRadius: 22, backgroundColor: T.accent, alignItems: "center", justifyContent: "center" },
  aiSub: { color: T.textDim, fontSize: 14, lineHeight: 20, marginBottom: 12 },
  aiBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, borderRadius: 22, paddingVertical: 12 },
  aiBtnText: { color: T.bg, fontSize: 14, fontWeight: "800" },
  aiText: { color: T.text, fontSize: 14, lineHeight: 21, flex: 1 },
  askBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: T.surfaceHi, borderRadius: 22, paddingVertical: 13, marginTop: 8 },
  askBtnText: { color: T.text, fontSize: 14, fontWeight: "700" },
  srcRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 14,
    paddingHorizontal: 10,
    paddingVertical: 10,
    borderRadius: 22,
    backgroundColor: T.bg2,
    
    
  },
  srcText: { flex: 1, color: T.textFaint, fontSize: 11, lineHeight: 15 },
  srcCta: { color: T.accent, fontSize: 11, fontWeight: "800" },
}); }
