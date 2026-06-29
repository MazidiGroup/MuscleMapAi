import React from "react";
import { View, Text, StyleSheet, ScrollView, Pressable } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";

import { COLORS, RADIUS, SPACING } from "@/src/theme";

type Day = {
  day: number;
  day_short: string;
  date: string;
  name: string;
  muscle_focus: string;
  rest: boolean;
  status: "today" | "completed" | "upcoming" | "missed" | "rest";
  exercise_count: number;
  workout_id?: string | null;
};

type Props = {
  week: Day[];
  onPressDay?: (day: Day) => void;
  variant?: "compact" | "expanded";
};

const STATUS_STYLE: Record<string, { bg: string; border: string; label: string; icon?: string; iconColor?: string }> = {
  today: { bg: "rgba(10,132,255,0.18)", border: COLORS.primary, label: "TODAY", icon: "play-circle", iconColor: COLORS.primary },
  completed: { bg: "rgba(52,211,153,0.12)", border: COLORS.success, label: "DONE", icon: "checkmark-circle", iconColor: COLORS.success },
  upcoming: { bg: COLORS.surface, border: COLORS.border, label: "" },
  missed: { bg: "rgba(239,68,68,0.10)", border: "rgba(239,68,68,0.45)", label: "MISSED", icon: "alert-circle", iconColor: COLORS.danger },
  rest: { bg: COLORS.surface, border: COLORS.border, label: "REST", icon: "moon", iconColor: COLORS.textSecondary },
};

export function WeeklyPlanner({ week, onPressDay, variant = "compact" }: Props) {
  const router = useRouter();

  const handlePress = (d: Day) => {
    if (onPressDay) return onPressDay(d);
    if (d.status === "completed" && d.workout_id) {
      router.push(`/workout/${d.workout_id}`);
    } else if (d.status === "today") {
      router.push("/(tabs)");
    }
  };

  return (
    <View testID="weekly-planner">
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.row}
      >
        {week.map((d) => {
          const s = STATUS_STYLE[d.status];
          return (
            <Pressable
              key={d.day}
              testID={`day-card-${d.day_short.toLowerCase()}`}
              onPress={() => handlePress(d)}
              style={[
                styles.card,
                variant === "expanded" && styles.cardLarge,
                { backgroundColor: s.bg, borderColor: s.border },
                d.status === "today" && styles.cardToday,
              ]}
            >
              <Text style={[styles.dayShort, d.status === "today" && { color: COLORS.primary }]}>{d.day_short}</Text>
              <Text style={[styles.dayNum, d.status === "today" && { color: COLORS.primary }]}>
                {new Date(d.date).getDate()}
              </Text>
              {s.icon ? (
                <Ionicons name={s.icon as any} size={14} color={s.iconColor || COLORS.textSecondary} style={{ marginTop: 6 }} />
              ) : (
                <View style={styles.iconPlaceholder} />
              )}
              <Text style={styles.workoutName} numberOfLines={1} ellipsizeMode="tail">
                {d.rest ? "Rest" : d.name.split("—")[0].trim()}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { gap: 8, paddingVertical: 4 },
  card: {
    width: 56,
    paddingVertical: 10,
    paddingHorizontal: 6,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    alignItems: "center",
    flexShrink: 0,
  },
  cardLarge: { width: 64, paddingVertical: 12 },
  cardToday: { borderWidth: 1.5 },
  dayShort: { color: COLORS.textSecondary, fontSize: 10, fontWeight: "700", letterSpacing: 1 },
  dayNum: { color: COLORS.text, fontSize: 18, fontWeight: "700", marginTop: 2 },
  iconPlaceholder: { height: 14, width: 14, marginTop: 6 },
  workoutName: { color: COLORS.textSecondary, fontSize: 9, marginTop: 4, fontWeight: "500", textAlign: "center", maxWidth: 50 },
});
