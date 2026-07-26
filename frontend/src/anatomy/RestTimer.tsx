import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AppState, AppStateStatus, Modal, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { legacyPalette, LegacyPalette } from "./ui";
import { useTheme } from "@/src/theme/ThemeContext";
import {
  RestClock,
  formatRemaining,
  pauseClock,
  progress,
  remainingSec,
  resumeClock,
  setClockTotal,
  startClock,
} from "./restClock";

const PRESETS = [30, 60, 90, 120];

/**
 * Rest timer driven by an absolute end timestamp rather than by counting ticks.
 * Backgrounding the app can therefore neither freeze the countdown nor let two
 * timers run: returning to the foreground recalculates the remaining time from
 * elapsed wall-clock time, and only one interval ever exists.
 */
export function RestTimer({
  visible,
  initial,
  onClose,
  onPrefChange,
}: {
  visible: boolean;
  initial: number;
  onClose: () => void;
  onPrefChange: (n: number) => void;
}) {
  const { mode } = useTheme();
  const T = useMemo(() => legacyPalette(mode), [mode]);
  const styles = useMemo(() => makeStyles(T), [T]);

  const [clock, setClock] = useState<RestClock>(() => startClock(initial, Date.now()));
  const [left, setLeft] = useState(initial);
  const tick = useRef<ReturnType<typeof setInterval> | null>(null);
  const paused = clock.pausedRemaining !== null;

  const resync = useCallback((c: RestClock) => setLeft(remainingSec(c, Date.now())), []);

  // Opening the sheet always starts a fresh rest period.
  useEffect(() => {
    if (!visible) return;
    const next = startClock(initial, Date.now());
    setClock(next);
    resync(next);
  }, [visible, initial, resync]);

  // Exactly one interval, and it only re-reads the wall clock.
  useEffect(() => {
    if (tick.current) {
      clearInterval(tick.current);
      tick.current = null;
    }
    if (!visible || paused) return;
    tick.current = setInterval(() => setLeft(remainingSec(clock, Date.now())), 500);
    return () => {
      if (tick.current) clearInterval(tick.current);
      tick.current = null;
    };
  }, [visible, paused, clock]);

  // Foregrounding recalculates from elapsed time instead of resuming a stale count.
  useEffect(() => {
    if (!visible) return;
    const onChange = (state: AppStateStatus) => {
      if (state === "active") resync(clock);
    };
    const sub = AppState.addEventListener("change", onChange);
    return () => sub.remove();
  }, [visible, clock, resync]);

  useEffect(() => {
    if (visible && left <= 0) {
      const t = setTimeout(onClose, 600);
      return () => clearTimeout(t);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [left, visible]);

  const setPreset = (n: number) => {
    const next = setClockTotal(clock, n, Date.now());
    setClock({ ...next, pausedRemaining: null });
    setLeft(n);
    onPrefChange(n);
  };

  const togglePause = () => {
    const now = Date.now();
    const next = paused ? resumeClock(clock, now) : pauseClock(clock, now);
    setClock(next);
    resync(next);
  };

  const pct = progress({ ...clock, pausedRemaining: paused ? left : null }, Date.now());

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.card} testID="rest-timer">
          <Text style={styles.label}>REST</Text>
          <Text style={styles.time} testID="rest-remaining">
            {formatRemaining(left)}
          </Text>
          <View style={styles.barTrack}>
            <View style={[styles.barFill, { width: `${pct * 100}%` }]} />
          </View>
          <View style={styles.presets}>
            {PRESETS.map((n) => (
              <TouchableOpacity
                key={n}
                style={[styles.preset, clock.total === n && styles.presetActive]}
                onPress={() => setPreset(n)}
                testID={`rest-${n}`}
              >
                <Text style={[styles.presetText, clock.total === n && { color: T.bg }]}>{n}s</Text>
              </TouchableOpacity>
            ))}
          </View>
          <View style={styles.actions}>
            <TouchableOpacity style={styles.actionBtn} onPress={togglePause} testID="rest-pause">
              <Ionicons name={paused ? "play" : "pause"} size={20} color={T.text} />
              <Text style={styles.actionText}>{paused ? "Resume" : "Pause"}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.actionBtn, styles.skip]} onPress={onClose} testID="rest-skip">
              <Ionicons name="play-skip-forward" size={20} color={T.bg} />
              <Text style={[styles.actionText, { color: T.bg }]}>Skip</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const makeStyles = (T: LegacyPalette) => StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.7)", justifyContent: "center", alignItems: "center", padding: 24 },
  card: { width: "100%", backgroundColor: T.surface, borderRadius: 24, borderWidth: 1, borderColor: T.border, padding: 24, alignItems: "center" },
  label: { color: T.accent, fontSize: 13, fontWeight: "800", letterSpacing: 2 },
  time: { color: T.text, fontSize: 64, fontWeight: "900", marginVertical: 8 },
  barTrack: { width: "100%", height: 8, borderRadius: 4, backgroundColor: T.surfaceHi, overflow: "hidden", marginBottom: 20 },
  barFill: { height: 8, borderRadius: 4, backgroundColor: T.accent },
  presets: { flexDirection: "row", gap: 8, marginBottom: 20 },
  preset: { flex: 1, minHeight: 44, justifyContent: "center", borderRadius: 10, backgroundColor: T.surfaceHi, borderWidth: 1, borderColor: T.border, alignItems: "center" },
  presetActive: { backgroundColor: T.accent, borderColor: T.accent },
  presetText: { color: T.text, fontSize: 14, fontWeight: "700" },
  actions: { flexDirection: "row", gap: 12, width: "100%" },
  actionBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: T.surfaceHi, borderWidth: 1, borderColor: T.border, minHeight: 48, borderRadius: 14 },
  skip: { backgroundColor: T.accent, borderColor: T.accent },
  actionText: { color: T.text, fontSize: 15, fontWeight: "700" },
});
