import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  Linking,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";

import { askCoach, CoachTurn, CoachRequestHandle } from "@/src/anatomy/coachApi";
import { useWorkout, weeklySetsByGroup, topPRs, Workout, PRs } from "@/src/anatomy/workoutStore";
import { ThinkingDots } from "@/src/components/ThinkingDots";
import { legacyPalette, LegacyPalette } from "@/src/anatomy/ui";
import { useTheme } from "@/src/theme/ThemeContext";
import { PremiumGate } from "@/src/premium/PremiumGate";
import { usePlanStore } from "@/src/plan/planStore";
import { FLAGS } from "@/src/config/featureFlags";
import { LiquidTouchableOpacity as TouchableOpacity } from "@/src/ui/LiquidTouchableOpacity";
import { LiquidSheen } from "@/src/ui/GlassSurface";

const DEFAULT_SUGGESTIONS = [
  "What muscles should I train for a bigger bench press?",
  "Explain the difference between the gastrocnemius and soleus.",
  "What's a good push/pull/legs split?",
  "Why are antagonist muscles important?",
];

// Build suggestions from the user's local workout history (nothing leaves the device
// until the user actually taps one and sends it as a normal chat message).
function buildSuggestions(history: Workout[], prs: PRs, unit: string): string[] {
  if (!FLAGS.coachV2 || history.length === 0) return DEFAULT_SUGGESTIONS;
  const out: string[] = [];
  const weekly = weeklySetsByGroup(history);
  const trained = weekly.list.filter((g) => g.sets > 0).sort((a, b) => b.sets - a.sets);
  if (trained[0]) out.push(`I trained ${trained[0].label.toLowerCase()} recently. How long should I rest before training it again?`);
  if (weekly.neglected.length > 0) out.push(`I haven't trained ${weekly.neglected.slice(0, 2).join(" or ").toLowerCase()} this week. Suggest a simple session.`);
  const pr = topPRs(prs, 1)[0];
  if (pr && pr.maxWeight > 0) out.push(`My best ${pr.name.toLowerCase()} is ${pr.maxWeight} ${unit}. How do I keep progressing?`);
  for (const s of DEFAULT_SUGGESTIONS) {
    if (out.length >= 4) break;
    out.push(s);
  }
  return out.slice(0, 4);
}

// Auto-linkify http(s) URLs in coach responses so citation links are tappable.
// Guideline 1.4.1 requires citations to be "easy for the user to find".
const URL_RE = /(https?:\/\/[^\s)]+)(?=[\s)]|$)/g;
/**
 * One message, memoised. The assistant's link parsing walks the whole string,
 * and the list re-renders on every streamed token — without this, each token
 * re-parsed every message already on screen.
 */
const MessageBubble = React.memo(function MessageBubble({
  role, content, busy, styles, T,
}: { role: string; content: string; busy: boolean; styles: any; T: LegacyPalette }) {
  const body = useMemo(
    () => (role === "assistant" ? renderMessageWithLinks(content, styles.bubbleText, styles.linkText) : null),
    [role, content, styles],
  );
  return (
    <View style={[styles.bubbleRow, role === "user" ? styles.rowRight : styles.rowLeft]}>
      <View style={[styles.bubble, role === "user" ? styles.userBubble : styles.aiBubble]}>
        <LiquidSheen tone={role === "user" ? "accent" : "neutral"} />
        {content === "" && busy ? (
          <ThinkingDots />
        ) : role === "assistant" ? (
          body
        ) : (
          <Text style={[styles.bubbleText, { color: T.bg }]}>{content}</Text>
        )}
      </View>
    </View>
  );
});

function renderMessageWithLinks(text: string, baseStyle: any, linkStyle: any) {
  if (!text) return null;
  const parts: React.ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  URL_RE.lastIndex = 0;
  while ((match = URL_RE.exec(text)) !== null) {
    const url = match[1];
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }
    parts.push(
      <Text
        key={`u-${match.index}`}
        style={linkStyle}
        onPress={() => Linking.openURL(url).catch(() => {})}
      >
        {url}
      </Text>,
    );
    lastIndex = match.index + url.length;
  }
  if (lastIndex < text.length) parts.push(text.slice(lastIndex));
  return <Text style={baseStyle}>{parts}</Text>;
}

export default function CoachScreen() {
  return (
    <PremiumGate surface="coach">
      <CoachContent />
    </PremiumGate>
  );
}

function CoachContent() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { mode } = useTheme();
  const T = useMemo(() => legacyPalette(mode), [mode]);
  const styles = useMemo(() => makeStyles(T), [T]);
  const params = useLocalSearchParams<{ q?: string }>();
  const { history: workoutHistory, prs, unit } = useWorkout();
  const [messages, setMessages] = useState<CoachTurn[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const scrollRef = useRef<ScrollView>(null);
  const sentQ = useRef<string | null>(null);
  const reqRef = useRef<CoachRequestHandle | null>(null);
  const stoppedRef = useRef(false);

  // Today's planned session, so the Coach opens on what the user is about to
  // do rather than a blank prompt.
  const plan = usePlanStore((st) => st.plan);
  const todayDay = plan ? plan.days[(new Date().getDay() + 6) % 7] : undefined;
  const todayName = todayDay && !todayDay.rest ? todayDay.typeName : null;
  const todayCount = todayDay && !todayDay.rest ? (todayDay.exercises || []).length : 0;
  const todaySets = todayDay && !todayDay.rest
    ? (todayDay.exercises || []).reduce((a: number, e: any) => a + (e.sets || 0), 0)
    : 0;

  const suggestions = useMemo(() => buildSuggestions(workoutHistory, prs, unit), [workoutHistory, prs, unit]);

  // Leaving the Coach screen cancels any in-flight request (saves quota + battery).
  useFocusEffect(
    useCallback(() => {
      return () => reqRef.current?.cancel();
    }, []),
  );

  const stop = () => {
    stoppedRef.current = true;
    reqRef.current?.cancel();
  };

  const send = (text: string) => {
    const msg = text.trim();
    if (!msg || busy) return;
    const history = messages.slice();
    setMessages((m) => [...m, { role: "user", content: msg }, { role: "assistant", content: "" }]);
    setInput("");
    setBusy(true);
    stoppedRef.current = false;
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 50);

    let acc = "";
    reqRef.current = askCoach(msg, history, null, {
      onDelta: (d) => {
        acc += d;
        setMessages((m) => {
          const next = m.slice();
          next[next.length - 1] = { role: "assistant", content: acc };
          return next;
        });
        scrollRef.current?.scrollToEnd({ animated: true });
      },
      onDone: () => {
        setBusy(false);
        if (!acc) {
          setMessages((m) => {
            const next = m.slice();
            next[next.length - 1] = { role: "assistant", content: stoppedRef.current ? "Stopped." : "(no response)" };
            return next;
          });
        }
      },
      onFail: () => {
        setBusy(false);
        setMessages((m) => {
          const next = m.slice();
          next[next.length - 1] = {
            role: "assistant",
            content: "⚠️ I couldn't reach the AI service right now. Please try again in a moment.",
          };
          return next;
        });
      },
    });
  };

  useEffect(() => {
    const q = params.q;
    if (q && sentQ.current !== q && !busy) {
      sentQ.current = q;
      send(q);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.q]);

  return (
    <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <View style={{ paddingTop: insets.top + 12, paddingHorizontal: 18, paddingBottom: 8 }}>
        <View style={styles.headerRow}>
          <View style={styles.avatar}>
            <Ionicons name="sparkles" size={20} color={T.bg} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.h1}>Muscle Map Coach</Text>
            <Text style={styles.sub}>Your workout assistant</Text>
          </View>
          {messages.length > 0 ? (
            <TouchableOpacity
              style={styles.newChat}
              onPress={() => setMessages([])}
              accessibilityRole="button"
              accessibilityLabel="Start a new conversation"
              testID="coach-new-chat"
            >
              <Ionicons name="create-outline" size={22} color={T.accent} />
            </TouchableOpacity>
          ) : null}
        </View>
        <View style={styles.disclaimer}>
          <LiquidSheen tone="subtle" />
          <Ionicons name="information-circle-outline" size={15} color={T.textFaint} />
          {/* The visible line is the summary; the full wording — including the
              advice to consult a professional — is the accessible label and the
              first thing on the Sources screen. */}
          <Text
            style={styles.disclaimerText}
            numberOfLines={1}
            accessibilityLabel="Training guidance, not medical advice. Consult a qualified professional before changing your training or health regimen."
          >
            Training guidance · Not medical advice
          </Text>
          <TouchableOpacity onPress={() => router.push("/references")} testID="coach-view-sources">
            <Text style={styles.disclaimerLink}>Sources</Text>
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView ref={scrollRef} style={{ flex: 1 }} contentContainerStyle={{ padding: 16, paddingBottom: 20 }}>
        {messages.length === 0 ? (
          <View style={styles.empty}>
            {todayName ? (
              <View style={styles.todayCard}>
                <LiquidSheen tone="neutral" />
                <Text style={styles.todayCaps}>TODAY&apos;S WORKOUT</Text>
                <Text style={styles.todayName}>{todayName}</Text>
                <Text style={styles.todayMeta}>
                  {todayCount} exercise{todayCount === 1 ? "" : "s"} · {todaySets} working set{todaySets === 1 ? "" : "s"}
                </Text>
                <View style={styles.todayRule} />
                <TouchableOpacity
                  style={styles.todayAsk}
                  onPress={() => send(`Tell me about today's ${todayName} session — why these exercises, and how should I approach it?`)}
                  accessibilityRole="button"
                  accessibilityLabel={`Ask about today's ${todayName} workout`}
                  testID="coach-ask-workout"
                >
                  <Ionicons name="chatbox-ellipses-outline" size={22} color={T.accent} />
                  <Text style={styles.todayAskText}>Ask about this workout</Text>
                  <Ionicons name="chevron-forward" size={18} color={T.accent} />
                </TouchableOpacity>
              </View>
            ) : null}

            <Text style={styles.qHeading}>Questions for your session</Text>
            {suggestions.map((s, i) => (
              <TouchableOpacity key={s} style={styles.suggestion} onPress={() => send(s)} testID="coach-suggestion">
                <View style={styles.qIcon}>
                  <Ionicons
                    name={i === 0 ? "barbell-outline" : i === 1 ? "repeat-outline" : "disc-outline"}
                    size={19}
                    color={T.accent}
                  />
                </View>
                <Text style={styles.suggestionText}>{s}</Text>
                <Ionicons name="arrow-forward" size={17} color={T.accent} />
              </TouchableOpacity>
            ))}
          </View>
        ) : (
          messages.map((m, i) => (
            <MessageBubble
              key={i}
              role={m.role}
              content={m.content}
              // Only the last bubble can be the one still streaming, so an
              // earlier message never re-renders when `busy` flips.
              busy={busy && i === messages.length - 1}
              styles={styles}
              T={T}
            />
          ))
        )}
      </ScrollView>

      <View style={[styles.inputBar, { paddingBottom: insets.bottom + 8 }]}>
        <TextInput
          style={styles.input}
          placeholder="Ask Muscle Map Coach…"
          placeholderTextColor={T.textFaint}
          value={input}
          onChangeText={setInput}
          onSubmitEditing={() => send(input)}
          editable={!busy}
          testID="coach-input"
        />
        {busy ? (
          <TouchableOpacity style={[styles.sendBtn, styles.stopBtn]} onPress={stop} testID="coach-stop">
            <Ionicons name="stop" size={18} color={T.text} />
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            style={[styles.sendBtn, !input.trim() && { opacity: 0.4 }]}
            onPress={() => send(input)}
            disabled={!input.trim()}
            testID="coach-send"
          >
            <Ionicons name="send" size={18} color={T.bg} />
          </TouchableOpacity>
        )}
      </View>
    </KeyboardAvoidingView>
  );
}

const makeStyles = (T: LegacyPalette) => StyleSheet.create({
  root: { flex: 1, backgroundColor: T.bg },
  headerRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  avatar: { width: 40, height: 40, borderRadius: 22, backgroundColor: T.accent, alignItems: "center", justifyContent: "center" },
  h1: { color: T.text, fontSize: 20, fontWeight: "800" },
  sub: { color: T.textDim, fontSize: 12 },
  disclaimer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    backgroundColor: T.surface,
    
    
    borderRadius: 22,
    overflow: "hidden",
  },
  disclaimerText: { flex: 1, color: T.textFaint, fontSize: 11, lineHeight: 15 },
  disclaimerLink: { color: T.accent, fontSize: 11, fontWeight: "800", marginLeft: 6 },
  newChat: { width: 44, height: 44, alignItems: "center", justifyContent: "center", borderRadius: 22, overflow: "hidden" },
  todayCard: {
    width: "100%", backgroundColor: T.bg2, borderRadius: 22, padding: 18,
    borderWidth: 1, borderColor: T.border, overflow: "hidden", marginBottom: 26,
  },
  todayCaps: { color: T.accent, fontSize: 12, fontWeight: "800", letterSpacing: 0.9 },
  todayName: { color: T.text, fontSize: 24, fontWeight: "800", marginTop: 8 },
  todayMeta: { color: T.textDim, fontSize: 15, marginTop: 6 },
  todayRule: { height: 1, backgroundColor: T.border, marginVertical: 16 },
  todayAsk: { flexDirection: "row", alignItems: "center", gap: 12, minHeight: 44 },
  todayAskText: { color: T.accent, fontSize: 16.5, fontWeight: "700", flex: 1 },
  qHeading: { color: T.text, fontSize: 19, fontWeight: "800", alignSelf: "flex-start", marginBottom: 12 },
  qIcon: {
    width: 42, height: 42, borderRadius: 12, alignItems: "center", justifyContent: "center",
    backgroundColor: T.surfaceHi,
  },
  empty: { alignItems: "center", paddingTop: 8, gap: 12 },
  emptyText: { color: T.textDim, fontSize: 15, textAlign: "center", marginBottom: 8, paddingHorizontal: 20 },
  suggestion: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    backgroundColor: T.bg2,
    borderWidth: 1,
    borderColor: T.border,
    borderRadius: 22,
    paddingHorizontal: 14,
    paddingVertical: 13,
    width: "100%",
  },
  suggestionText: { color: T.text, fontSize: 16, fontWeight: "600", flex: 1 },
  bubbleRow: { marginBottom: 10, flexDirection: "row" },
  rowRight: { justifyContent: "flex-end" },
  rowLeft: { justifyContent: "flex-start" },
  bubble: { maxWidth: "84%", paddingHorizontal: 14, paddingVertical: 10, borderRadius: 22, overflow: "hidden" },
  userBubble: { backgroundColor: T.accent, borderBottomRightRadius: 4 },
  aiBubble: { backgroundColor: T.surface, borderBottomLeftRadius: 4 },
  bubbleText: { color: T.text, fontSize: 15, lineHeight: 21 },
  linkText: { color: T.accent, textDecorationLine: "underline", fontSize: 15, lineHeight: 21 },
  inputBar: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 14, paddingTop: 8, borderTopWidth: 1, borderTopColor: T.border, backgroundColor: T.bg2 },
  input: { flex: 1, backgroundColor: T.surface, borderRadius: 22, paddingHorizontal: 16, paddingVertical: 11, color: T.text, fontSize: 15, maxHeight: 100 },
  sendBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: T.accent, alignItems: "center", justifyContent: "center" },
  stopBtn: { backgroundColor: T.surfaceHi, },
});
