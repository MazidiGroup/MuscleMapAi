import React, { useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Linking,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";

import { askCoach, CoachTurn } from "@/src/anatomy/coachApi";
import { T } from "@/src/anatomy/ui";
import { usePremium } from "@/src/premium/PremiumContext";
import { Paywall } from "@/src/premium/Paywall";

const SUGGESTIONS = [
  "What muscles should I train for a bigger bench press?",
  "Explain the difference between the gastrocnemius and soleus.",
  "What's a good push/pull/legs split?",
  "Why are antagonist muscles important?",
];

// Auto-linkify http(s) URLs in coach responses so citation links are tappable.
// Guideline 1.4.1 requires citations to be "easy for the user to find".
const URL_RE = /(https?:\/\/[^\s)]+)(?=[\s)]|$)/g;
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
  const { isPremium } = usePremium();
  if (!isPremium) return <Paywall title="Unlock AI Coach" />;
  return <CoachContent />;
}

function CoachContent() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const params = useLocalSearchParams<{ q?: string }>();
  const [messages, setMessages] = useState<CoachTurn[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const scrollRef = useRef<ScrollView>(null);
  const sentQ = useRef<string | null>(null);

  const send = (text: string) => {
    const msg = text.trim();
    if (!msg || busy) return;
    const history = messages.slice();
    setMessages((m) => [...m, { role: "user", content: msg }, { role: "assistant", content: "" }]);
    setInput("");
    setBusy(true);
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 50);

    let acc = "";
    askCoach(msg, history, null, {
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
            next[next.length - 1] = { role: "assistant", content: "(no response)" };
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
            <Ionicons name="sparkles" size={18} color={T.bg} />
          </View>
          <View>
            <Text style={styles.h1}>Atlas Coach</Text>
            <Text style={styles.sub}>AI anatomy & training assistant</Text>
          </View>
        </View>
        <View style={styles.disclaimer}>
          <Ionicons name="information-circle-outline" size={14} color={T.textFaint} />
          <Text style={styles.disclaimerText} numberOfLines={3}>
            Educational information only, not medical advice. Consult a qualified professional before
            changing your training or health regimen.
          </Text>
          <TouchableOpacity onPress={() => router.push("/references")} testID="coach-view-sources">
            <Text style={styles.disclaimerLink}>Sources</Text>
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView ref={scrollRef} style={{ flex: 1 }} contentContainerStyle={{ padding: 16, paddingBottom: 20 }}>
        {messages.length === 0 ? (
          <View style={styles.empty}>
            <Ionicons name="chatbubbles-outline" size={36} color={T.textFaint} />
            <Text style={styles.emptyText}>Ask me anything about muscles, anatomy or training.</Text>
            {SUGGESTIONS.map((s) => (
              <TouchableOpacity key={s} style={styles.suggestion} onPress={() => send(s)} testID="coach-suggestion">
                <Text style={styles.suggestionText}>{s}</Text>
                <Ionicons name="arrow-forward" size={15} color={T.accent} />
              </TouchableOpacity>
            ))}
          </View>
        ) : (
          messages.map((m, i) => (
            <View key={i} style={[styles.bubbleRow, m.role === "user" ? styles.rowRight : styles.rowLeft]}>
              <View style={[styles.bubble, m.role === "user" ? styles.userBubble : styles.aiBubble]}>
                {m.content === "" && busy ? (
                  <ActivityIndicator color={T.accent} size="small" />
                ) : m.role === "assistant" ? (
                  renderMessageWithLinks(m.content, styles.bubbleText, styles.linkText)
                ) : (
                  <Text style={[styles.bubbleText, { color: T.bg }]}>{m.content}</Text>
                )}
              </View>
            </View>
          ))
        )}
      </ScrollView>

      <View style={[styles.inputBar, { paddingBottom: insets.bottom + 8 }]}>
        <TextInput
          style={styles.input}
          placeholder="Ask Atlas…"
          placeholderTextColor={T.textFaint}
          value={input}
          onChangeText={setInput}
          onSubmitEditing={() => send(input)}
          editable={!busy}
          testID="coach-input"
        />
        <TouchableOpacity
          style={[styles.sendBtn, (!input.trim() || busy) && { opacity: 0.4 }]}
          onPress={() => send(input)}
          disabled={!input.trim() || busy}
          testID="coach-send"
        >
          <Ionicons name="send" size={18} color={T.bg} />
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: T.bg },
  headerRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  avatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: T.accent, alignItems: "center", justifyContent: "center" },
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
    borderWidth: 1,
    borderColor: T.border,
    borderRadius: 10,
  },
  disclaimerText: { flex: 1, color: T.textFaint, fontSize: 11, lineHeight: 15 },
  disclaimerLink: { color: T.accent, fontSize: 11, fontWeight: "800", marginLeft: 6 },
  empty: { alignItems: "center", paddingTop: 40, gap: 12 },
  emptyText: { color: T.textDim, fontSize: 15, textAlign: "center", marginBottom: 8, paddingHorizontal: 20 },
  suggestion: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    backgroundColor: T.surface,
    borderWidth: 1,
    borderColor: T.border,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    width: "100%",
  },
  suggestionText: { color: T.text, fontSize: 14, flex: 1 },
  bubbleRow: { marginBottom: 10, flexDirection: "row" },
  rowRight: { justifyContent: "flex-end" },
  rowLeft: { justifyContent: "flex-start" },
  bubble: { maxWidth: "84%", paddingHorizontal: 14, paddingVertical: 10, borderRadius: 16 },
  userBubble: { backgroundColor: T.accent, borderBottomRightRadius: 4 },
  aiBubble: { backgroundColor: T.surface, borderWidth: 1, borderColor: T.border, borderBottomLeftRadius: 4 },
  bubbleText: { color: T.text, fontSize: 15, lineHeight: 21 },
  linkText: { color: T.accent, textDecorationLine: "underline", fontSize: 15, lineHeight: 21 },
  inputBar: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 14, paddingTop: 8, borderTopWidth: 1, borderTopColor: T.border, backgroundColor: T.bg2 },
  input: { flex: 1, backgroundColor: T.surface, borderWidth: 1, borderColor: T.border, borderRadius: 22, paddingHorizontal: 16, paddingVertical: 11, color: T.text, fontSize: 15, maxHeight: 100 },
  sendBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: T.accent, alignItems: "center", justifyContent: "center" },
});
