import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  Pressable,
  ScrollView,
  ActivityIndicator,
  Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";

import { COLORS, RADIUS, SPACING } from "@/src/theme";
import { apiGet, streamCoach } from "@/src/api";
import { useAuth } from "@/src/auth-context";
import { ThinkingDots } from "@/src/components/ThinkingDots";

type Msg = {
  role: "user" | "assistant";
  content: string;
  id: string;
  status?: "streaming" | "done" | "failed" | "gated";
};

const SUGGESTIONS = [
  "I only have 30 minutes today",
  "My shoulder hurts",
  "How can I break my bench plateau?",
  "What should I eat post-workout?",
];

export default function Coach() {
  const router = useRouter();
  const { user } = useAuth();
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const scrollRef = useRef<ScrollView>(null);
  const lastSent = useRef<string>("");

  const load = useCallback(async () => {
    try {
      const out = await apiGet<{ messages: any[] }>("/coach/messages");
      setMessages(
        out.messages.map((m: any, i: number) => ({
          role: m.role,
          content: m.content,
          id: `m_${i}_${Date.now()}`,
          status: "done",
        })),
      );
    } catch {
      // Silently fail - chat history will simply be empty
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const send = async (overrideText?: string) => {
    const text = (overrideText ?? input).trim();
    if (!text || streaming) return;
    setInput("");
    lastSent.current = text;
    const userMsg: Msg = { role: "user", content: text, id: `u_${Date.now()}`, status: "done" };
    const aiMsg: Msg = { role: "assistant", content: "", id: `a_${Date.now()}`, status: "streaming" };
    setMessages((m) => [...m, userMsg, aiMsg]);
    setStreaming(true);
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 80);

    streamCoach(
      text,
      (delta) => {
        setMessages((m) => {
          const copy = [...m];
          const last = copy[copy.length - 1];
          if (last && last.role === "assistant") {
            copy[copy.length - 1] = { ...last, content: last.content + delta, status: "streaming" };
          }
          return copy;
        });
        scrollRef.current?.scrollToEnd({ animated: false });
      },
      (info) => {
        setMessages((m) => {
          const copy = [...m];
          const last = copy[copy.length - 1];
          if (last && last.role === "assistant") {
            copy[copy.length - 1] = { ...last, status: info?.gated ? "gated" : "done" };
          }
          return copy;
        });
        setStreaming(false);
      },
      () => {
        setMessages((m) => {
          const copy = [...m];
          const last = copy[copy.length - 1];
          if (last && last.role === "assistant") {
            copy[copy.length - 1] = {
              ...last,
              content: last.content || "",
              status: "failed",
            };
          }
          return copy;
        });
        setStreaming(false);
      },
    );
  };

  const retry = () => {
    // Remove the last failed assistant message + retry the user message
    setMessages((m) => {
      const copy = [...m];
      // Pop trailing failed assistant
      if (copy[copy.length - 1]?.status === "failed") copy.pop();
      // Pop the user message — we'll re-send it
      const lastUser = copy[copy.length - 1];
      if (lastUser?.role === "user") {
        copy.pop();
        setTimeout(() => send(lastUser.content), 100);
      } else if (lastSent.current) {
        setTimeout(() => send(lastSent.current), 100);
      }
      return copy;
    });
  };

  return (
    <SafeAreaView style={styles.root} edges={["top"]} testID="coach-screen">
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Apex</Text>
          <Text style={styles.subtitle}>
            {user?.is_premium ? "Premium · Unlimited" : "Your AI strength coach"}
          </Text>
        </View>
        <View style={styles.statusDot} />
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={Platform.OS === "ios" ? 0 : 0}
        style={{ flex: 1 }}
      >
        <ScrollView
          ref={scrollRef}
          contentContainerStyle={styles.scroll}
          showsVerticalScrollIndicator={false}
          keyboardDismissMode="interactive"
          keyboardShouldPersistTaps="handled"
        >
          {messages.length === 0 && (
            <View style={styles.empty}>
              <View style={styles.emptyIcon}>
                <Ionicons name="sparkles" size={28} color={COLORS.primary} />
              </View>
              <Text style={styles.emptyTitle}>How can I help today?</Text>
              <Text style={styles.emptySub}>I remember your training history and adapt accordingly.</Text>
            </View>
          )}

          {messages.map((m, i) => {
            const isLast = i === messages.length - 1;
            const showDots = m.role === "assistant" && m.status === "streaming" && !m.content;
            const showFailed = m.role === "assistant" && m.status === "failed";
            const showGated = m.role === "assistant" && m.status === "gated";
            return (
              <View
                key={m.id}
                testID={`message-${m.role}`}
                style={[styles.bubble, m.role === "user" ? styles.bubbleUser : styles.bubbleAI]}
              >
                {m.role === "assistant" && <Text style={styles.aiLabel}>APEX</Text>}
                {showDots ? (
                  <ThinkingDots />
                ) : showFailed ? (
                  <View>
                    <Text style={styles.errorText} testID="coach-error">
                      I&apos;m having trouble reaching the coach right now. Please try again in a moment.
                    </Text>
                    {isLast && !streaming && (
                      <Pressable
                        testID="coach-retry-button"
                        onPress={retry}
                        style={({ pressed }) => [styles.retryBtn, pressed && { opacity: 0.8 }]}
                      >
                        <Ionicons name="refresh" size={14} color={COLORS.primary} />
                        <Text style={styles.retryText}>Retry</Text>
                      </Pressable>
                    )}
                  </View>
                ) : showGated ? (
                  <View>
                    <Text style={m.role === "user" ? styles.bubbleUserText : styles.bubbleAIText}>{m.content}</Text>
                    <Pressable
                      testID="upgrade-from-gated"
                      onPress={() => router.push("/subscribe")}
                      style={[styles.retryBtn, { marginTop: 10 }]}
                    >
                      <Ionicons name="diamond" size={14} color={COLORS.primary} />
                      <Text style={styles.retryText}>Upgrade to Premium</Text>
                    </Pressable>
                  </View>
                ) : (
                  <Text style={m.role === "user" ? styles.bubbleUserText : styles.bubbleAIText}>
                    {m.content}
                  </Text>
                )}
              </View>
            );
          })}

          {messages.length === 0 && (
            <View style={styles.suggestions}>
              {SUGGESTIONS.map((s, i) => (
                <Pressable
                  key={i}
                  testID={`suggestion-${i}`}
                  onPress={() => send(s)}
                  style={styles.suggestionChip}
                >
                  <Text style={styles.suggestionText}>{s}</Text>
                </Pressable>
              ))}
            </View>
          )}
        </ScrollView>

        <View style={styles.inputBar}>
          <TextInput
            testID="coach-input"
            value={input}
            onChangeText={setInput}
            placeholder={streaming ? "Coach is thinking…" : "Ask anything…"}
            placeholderTextColor={COLORS.textTertiary}
            style={styles.input}
            multiline
            editable={!streaming}
            onSubmitEditing={() => send()}
            blurOnSubmit
          />
          <Pressable
            testID="coach-send-button"
            onPress={() => send()}
            disabled={!input.trim() || streaming}
            style={[styles.sendBtn, (!input.trim() || streaming) && styles.sendBtnDisabled]}
          >
            {streaming ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Ionicons name="arrow-up" size={18} color="#fff" />
            )}
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.bg },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: SPACING["2xl"], paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  title: { color: COLORS.text, fontSize: 24, fontWeight: "700", letterSpacing: -0.5 },
  subtitle: { color: COLORS.textSecondary, fontSize: 13, marginTop: 2 },
  statusDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: COLORS.success },
  scroll: { padding: SPACING["2xl"], paddingBottom: 100 },
  empty: { alignItems: "center", paddingVertical: SPACING["3xl"] },
  emptyIcon: { width: 64, height: 64, borderRadius: 32, backgroundColor: "rgba(10,132,255,0.12)", alignItems: "center", justifyContent: "center", marginBottom: 16 },
  emptyTitle: { color: COLORS.text, fontSize: 22, fontWeight: "700", marginBottom: 6 },
  emptySub: { color: COLORS.textSecondary, fontSize: 14, textAlign: "center", maxWidth: 280 },
  bubble: { marginBottom: 12, padding: 14, maxWidth: "92%" },
  bubbleUser: { alignSelf: "flex-end", backgroundColor: COLORS.surfaceElevated, borderRadius: 18, borderTopRightRadius: 4 },
  bubbleAI: { alignSelf: "flex-start", borderWidth: 1, borderColor: COLORS.border, borderRadius: 18, borderTopLeftRadius: 4, backgroundColor: "transparent" },
  bubbleUserText: { color: COLORS.text, fontSize: 15, lineHeight: 22 },
  bubbleAIText: { color: COLORS.text, fontSize: 15, lineHeight: 22 },
  aiLabel: { color: COLORS.primary, fontSize: 10, fontWeight: "700", letterSpacing: 2, marginBottom: 4 },
  errorText: { color: COLORS.textSecondary, fontSize: 14, lineHeight: 21, fontStyle: "italic" },
  retryBtn: { flexDirection: "row", gap: 6, alignItems: "center", marginTop: 10, paddingVertical: 8, paddingHorizontal: 14, backgroundColor: "rgba(10,132,255,0.10)", borderRadius: 999, alignSelf: "flex-start", borderWidth: 1, borderColor: COLORS.primary },
  retryText: { color: COLORS.primary, fontSize: 12, fontWeight: "700" },
  suggestions: { marginTop: SPACING.xl, gap: 10 },
  suggestionChip: { paddingVertical: 12, paddingHorizontal: 16, backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border, borderRadius: 999 },
  suggestionText: { color: COLORS.text, fontSize: 14 },
  inputBar: { flexDirection: "row", alignItems: "flex-end", gap: 10, padding: 12, paddingBottom: Platform.OS === "ios" ? 12 : 14, borderTopWidth: 1, borderTopColor: COLORS.border, backgroundColor: COLORS.bg },
  input: { flex: 1, backgroundColor: COLORS.surfaceElevated, borderRadius: 20, paddingHorizontal: 16, paddingVertical: Platform.OS === "ios" ? 12 : 8, color: COLORS.text, fontSize: 15, maxHeight: 120, minHeight: 44 },
  sendBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: COLORS.primary, alignItems: "center", justifyContent: "center" },
  sendBtnDisabled: { opacity: 0.35 },
});
