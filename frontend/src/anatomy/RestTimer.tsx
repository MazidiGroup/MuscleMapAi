import React, { useEffect, useMemo, useRef, useState } from "react";
import { View, Text, StyleSheet, TouchableOpacity, Modal } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { legacyPalette, LegacyPalette } from "./ui";
import { useTheme } from "@/src/theme/ThemeContext";

const PRESETS = [30, 60, 90, 120];

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
  const [total, setTotal] = useState(initial);
  const [left, setLeft] = useState(initial);
  const [paused, setPaused] = useState(false);
  const timer = useRef<any>(null);

  useEffect(() => {
    if (!visible) return;
    setTotal(initial);
    setLeft(initial);
    setPaused(false);
  }, [visible, initial]);

  useEffect(() => {
    if (!visible || paused) return;
    timer.current = setInterval(() => {
      setLeft((l) => {
        if (l <= 1) {
          clearInterval(timer.current);
          return 0;
        }
        return l - 1;
      });
    }, 1000);
    return () => clearInterval(timer.current);
  }, [visible, paused]);

  useEffect(() => {
    if (visible && left === 0) {
      const t = setTimeout(onClose, 600);
      return () => clearTimeout(t);
    }
  }, [left, visible]);

  const setPreset = (n: number) => {
    setTotal(n);
    setLeft(n);
    setPaused(false);
    onPrefChange(n);
  };

  const mm = String(Math.floor(left / 60)).padStart(1, "0");
  const ss = String(left % 60).padStart(2, "0");
  const pct = total > 0 ? left / total : 0;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.card} testID="rest-timer">
          <Text style={styles.label}>REST</Text>
          <Text style={styles.time}>
            {mm}:{ss}
          </Text>
          <View style={styles.barTrack}>
            <View style={[styles.barFill, { width: `${pct * 100}%` }]} />
          </View>
          <View style={styles.presets}>
            {PRESETS.map((n) => (
              <TouchableOpacity key={n} style={[styles.preset, total === n && styles.presetActive]} onPress={() => setPreset(n)} testID={`rest-${n}`}>
                <Text style={[styles.presetText, total === n && { color: T.bg }]}>{n}s</Text>
              </TouchableOpacity>
            ))}
          </View>
          <View style={styles.actions}>
            <TouchableOpacity style={styles.actionBtn} onPress={() => setPaused((p) => !p)} testID="rest-pause">
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
  preset: { flex: 1, paddingVertical: 10, borderRadius: 10, backgroundColor: T.surfaceHi, borderWidth: 1, borderColor: T.border, alignItems: "center" },
  presetActive: { backgroundColor: T.accent, borderColor: T.accent },
  presetText: { color: T.text, fontSize: 14, fontWeight: "700" },
  actions: { flexDirection: "row", gap: 12, width: "100%" },
  actionBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: T.surfaceHi, borderWidth: 1, borderColor: T.border, paddingVertical: 14, borderRadius: 14 },
  skip: { backgroundColor: T.accent, borderColor: T.accent },
  actionText: { color: T.text, fontSize: 15, fontWeight: "700" },
});
