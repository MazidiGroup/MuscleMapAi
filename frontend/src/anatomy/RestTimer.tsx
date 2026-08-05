import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AccessibilityInfo,
  AppState,
  AppStateStatus,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { legacyPalette, LegacyPalette } from "./ui";
import { useTheme } from "@/src/theme/ThemeContext";
import {
  RestClock,
  extendClock,
  formatRemaining,
  pauseClock,
  progress,
  remainingSec,
  resumeClock,
  setClockTotal,
  startClock,
} from "./restClock";

const PRESETS = [30, 60, 90, 120];
/** Seconds added by the "+15s" control to a rest period that is already running. */
const EXTEND_SEC = 15;

/**
 * Every control in the timer is a real button: it has an accessible name, it is
 * reachable by keyboard (Enter/Space on web, because a `button` role maps to a
 * native button element), it shows a visible focus ring, and its hit area is at
 * least 44×44.
 */
function TimerButton({
  label,
  onPress,
  testID,
  style,
  selected,
  children,
  ringStyle,
}: {
  label: string;
  onPress: () => void;
  testID: string;
  style: any;
  selected?: boolean;
  children: React.ReactNode;
  ringStyle: any;
}) {
  const [focused, setFocused] = useState(false);
  return (
    <TouchableOpacity
      accessible
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected: !!selected }}
      onPress={onPress}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      testID={testID}
      style={[style, focused && ringStyle]}
    >
      {children}
    </TouchableOpacity>
  );
}

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

  // The sheet closes itself once rest is over, but not before the "Rest complete"
  // status line has been on screen — and in the live region — long enough to be
  // read out. Removing the live region sooner can swallow the announcement.
  useEffect(() => {
    if (visible && left <= 0) {
      const t = setTimeout(onClose, 1400);
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

  /** Adds 15s to the rest that is already running — it does not restart it. */
  const extend = () => {
    const now = Date.now();
    const next = extendClock(clock, EXTEND_SEC, now);
    setClock(next);
    setLeft(remainingSec(next, now));
  };

  const togglePause = () => {
    const now = Date.now();
    const next = paused ? resumeClock(clock, now) : pauseClock(clock, now);
    setClock(next);
    resync(next);
  };

  // Exactly ONE completion announcement per rest period. On web the status line
  // below is itself a live region, so announcing again would double it up.
  const announced = useRef(false);
  useEffect(() => {
    if (!visible) announced.current = false;
  }, [visible]);
  useEffect(() => {
    if (!visible || left > 0 || announced.current) return;
    announced.current = true;
    if (Platform.OS !== "web") AccessibilityInfo.announceForAccessibility("Rest complete");
  }, [visible, left]);

  const pct = progress({ ...clock, pausedRemaining: paused ? left : null }, Date.now());
  const done = left <= 0;
  // role="timer" is the correct ARIA role for a countdown; it is deliberately not
  // a live region, so the ticking value is not announced every second.
  const timerRoleProps = Platform.OS === "web" ? ({ role: "timer" } as any) : null;
  const statusRoleProps = Platform.OS === "web" ? ({ role: "status", "aria-live": "polite" } as any) : null;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      {/* Tapping outside the card ends the rest period. Without this the overlay
          silently swallows every tap until the countdown runs out. */}
      <Pressable
        style={styles.backdrop}
        onPress={onClose}
        accessibilityRole="button"
        accessibilityLabel="Close rest timer"
        testID="rest-backdrop"
      >
        <Pressable style={styles.card} testID="rest-timer" onPress={() => {}}>
          <Text style={styles.label}>REST</Text>
          <Text
            style={styles.time}
            testID="rest-remaining"
            accessibilityLabel={`${formatRemaining(left)} rest remaining`}
            {...timerRoleProps}
          >
            {formatRemaining(left)}
          </Text>
          <View style={styles.barTrack}>
            <View style={[styles.barFill, { width: `${pct * 100}%` }]} />
          </View>
          <View
            style={styles.statusLine}
            accessibilityLiveRegion="polite"
            testID="rest-status"
            {...statusRoleProps}
          >
            <Text style={styles.statusText}>{done ? "Rest complete" : ""}</Text>
          </View>
          <View style={styles.presets}>
            {PRESETS.map((n) => (
              <TimerButton
                key={n}
                label={`Set rest to ${n} seconds`}
                selected={clock.total === n}
                onPress={() => setPreset(n)}
                testID={`rest-${n}`}
                ringStyle={styles.focusRing}
                style={[styles.preset, clock.total === n && styles.presetActive]}
              >
                <Text style={[styles.presetText, clock.total === n && { color: T.bg }]}>{n}s</Text>
              </TimerButton>
            ))}
          </View>
          <View style={styles.actions}>
            <TimerButton
              label={paused ? "Resume rest timer" : "Pause rest timer"}
              onPress={togglePause}
              testID="rest-pause"
              ringStyle={styles.focusRing}
              style={styles.actionBtn}
            >
              <Ionicons name={paused ? "play" : "pause"} size={20} color={T.text} />
              <Text style={styles.actionText}>{paused ? "Resume" : "Pause"}</Text>
            </TimerButton>
            <TimerButton
              label="Add 15 seconds"
              onPress={extend}
              testID="rest-add-15"
              ringStyle={styles.focusRing}
              style={styles.actionBtn}
            >
              <Ionicons name="add" size={20} color={T.text} />
              <Text style={styles.actionText}>15s</Text>
            </TimerButton>
            <TimerButton
              label="Skip rest"
              onPress={onClose}
              testID="rest-skip"
              ringStyle={styles.focusRing}
              style={[styles.actionBtn, styles.skip]}
            >
              <Ionicons name="play-skip-forward" size={20} color={T.bg} />
              <Text style={[styles.actionText, { color: T.bg }]}>Skip</Text>
            </TimerButton>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const makeStyles = (T: LegacyPalette) => StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.7)", justifyContent: "center", alignItems: "center", padding: 24 },
  card: { width: "100%", backgroundColor: T.surface, borderRadius: 24, borderWidth: 1, borderColor: T.border, padding: 24, alignItems: "center" },
  label: { color: T.accent, fontSize: 13, fontWeight: "800", letterSpacing: 2 },
  time: { color: T.text, fontSize: 64, fontWeight: "900", marginVertical: 8 },
  barTrack: { width: "100%", height: 8, borderRadius: 4, backgroundColor: T.surfaceHi, overflow: "hidden", marginBottom: 12 },
  barFill: { height: 8, borderRadius: 4, backgroundColor: T.accent },
  statusLine: { minHeight: 20, marginBottom: 8, justifyContent: "center" },
  statusText: { color: T.accent, fontSize: 14, fontWeight: "700" },
  presets: { flexDirection: "row", gap: 8, marginBottom: 20, width: "100%" },
  preset: { flex: 1, minHeight: 44, justifyContent: "center", borderRadius: 10, backgroundColor: T.surfaceHi, borderWidth: 1, borderColor: T.border, alignItems: "center" },
  presetActive: { backgroundColor: T.accent, borderColor: T.accent },
  presetText: { color: T.text, fontSize: 14, fontWeight: "700" },
  actions: { flexDirection: "row", gap: 12, width: "100%" },
  actionBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, backgroundColor: T.surfaceHi, borderWidth: 1, borderColor: T.border, minHeight: 48, minWidth: 44, borderRadius: 14 },
  skip: { backgroundColor: T.accent, borderColor: T.accent },
  actionText: { color: T.text, fontSize: 15, fontWeight: "700" },
  // Keyboard focus must be visible without changing any existing colour value.
  focusRing: { borderWidth: 2, borderColor: T.text },
});
