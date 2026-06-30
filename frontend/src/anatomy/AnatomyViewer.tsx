import React, {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import {
  View,
  StyleSheet,
  PanResponder,
  ActivityIndicator,
  Text,
  TouchableOpacity,
  LayoutChangeEvent,
} from "react-native";
import { GLView } from "expo-gl";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { AnatomyEngine } from "./engine";

const MODEL_URL = `${process.env.EXPO_PUBLIC_BACKEND_URL || ""}/api/anatomy/model`;

// Cache the downloaded model buffer across mounts (so tab switches are instant).
let cachedBuffer: ArrayBuffer | null = null;

export type ViewerHandle = {
  resetView: () => void;
  focusUnit: (name: string) => void;
  focusContainer: (name: string | null) => void;
};

type Props = {
  mode?: "explore" | "workout";
  primary?: string[];
  secondary?: string[];
  shrink?: number;
  hidden?: string[];
  isolate?: string | null;
  onSelect?: (name: string | null) => void;
  onReady?: () => void;
};

function dist(a: any, b: any) {
  const dx = a.pageX - b.pageX;
  const dy = a.pageY - b.pageY;
  return Math.sqrt(dx * dx + dy * dy);
}

export const AnatomyViewer = forwardRef<ViewerHandle, Props>(function AnatomyViewer(
  { mode = "explore", primary = [], secondary = [], shrink = 0, hidden = [], isolate = null, onSelect, onReady },
  ref,
) {
  const engineRef = useRef<AnatomyEngine | null>(null);
  const [ready, setReady] = useState(false);
  const insets = useSafeAreaInsets();
  const [error, setError] = useState<string | null>(null);
  const layout = useRef({ w: 1, h: 1 });
  const gesture = useRef({ lastX: 0, lastY: 0, lastDist: 0, two: false, sx: 0, sy: 0, moved: 0 });

  // ---- imperative API ----
  useImperativeHandle(ref, () => ({
    resetView: () => engineRef.current?.resetView(),
    focusUnit: (name: string) => engineRef.current?.focusUnit(name),
    focusContainer: (name: string | null) => engineRef.current?.focusContainer(name),
  }));

  // ---- apply declarative props after ready ----
  useEffect(() => {
    if (ready) engineRef.current?.setMode(mode);
  }, [mode, ready]);
  useEffect(() => {
    if (ready) engineRef.current?.setHighlight(primary, secondary);
  }, [JSON.stringify(primary), JSON.stringify(secondary), ready]);
  useEffect(() => {
    if (ready) engineRef.current?.setShrink(shrink);
  }, [shrink, ready]);
  useEffect(() => {
    if (ready) engineRef.current?.setHidden(hidden);
  }, [JSON.stringify(hidden), ready]);
  useEffect(() => {
    if (ready) engineRef.current?.focusContainer(isolate ?? null);
  }, [isolate, ready]);

  const onContextCreate = useCallback(async (gl: any) => {
    const engine = new AnatomyEngine(gl, {
      onReady: () => {
        setReady(true);
        // apply initial state
        engine.setMode(mode);
        engine.setHighlight(primary, secondary);
        engine.setShrink(shrink);
        engine.setHidden(hidden);
        if (isolate) engine.focusContainer(isolate);
        onReady?.();
      },
      onError: (msg) => setError(msg),
    });
    engineRef.current = engine;

    try {
      if (!cachedBuffer) {
        const res = await fetch(MODEL_URL);
        if (!res.ok) throw new Error(`Model fetch failed (${res.status})`);
        cachedBuffer = await res.arrayBuffer();
      }
      // clone the buffer because GLTFLoader may take ownership of it
      await engine.loadModel(cachedBuffer.slice(0));
    } catch (e: any) {
      setError(String(e?.message || e));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    return () => engineRef.current?.dispose();
  }, []);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (evt) => {
        const t = evt.nativeEvent.touches;
        const g = gesture.current;
        g.moved = 0;
        if (t.length >= 2) {
          g.two = true;
          g.lastDist = dist(t[0], t[1]);
          g.lastX = (t[0].pageX + t[1].pageX) / 2;
          g.lastY = (t[0].pageY + t[1].pageY) / 2;
        } else {
          g.two = false;
          g.lastX = t[0].pageX;
          g.lastY = t[0].pageY;
          g.sx = t[0].locationX;
          g.sy = t[0].locationY;
        }
      },
      onPanResponderMove: (evt) => {
        const t = evt.nativeEvent.touches;
        const g = gesture.current;
        const eng = engineRef.current;
        if (!eng) return;
        if (t.length >= 2) {
          const d = dist(t[0], t[1]);
          const mx = (t[0].pageX + t[1].pageX) / 2;
          const my = (t[0].pageY + t[1].pageY) / 2;
          if (g.two && g.lastDist > 0) {
            eng.zoom(g.lastDist / d);
            eng.pan(mx - g.lastX, my - g.lastY);
          }
          g.two = true;
          g.lastDist = d;
          g.lastX = mx;
          g.lastY = my;
          g.moved += 10;
        } else {
          const dx = t[0].pageX - g.lastX;
          const dy = t[0].pageY - g.lastY;
          eng.rotate(dx, dy);
          g.moved += Math.abs(dx) + Math.abs(dy);
          g.lastX = t[0].pageX;
          g.lastY = t[0].pageY;
        }
      },
      onPanResponderRelease: (evt) => {
        const g = gesture.current;
        const eng = engineRef.current;
        if (!eng) return;
        if (!g.two && g.moved < 6) {
          // treat as tap -> pick
          const nx = (g.sx / layout.current.w) * 2 - 1;
          const ny = -(g.sy / layout.current.h) * 2 + 1;
          const name = eng.pick(nx, ny);
          eng.setSelected(name);
          onSelect?.(name);
        }
      },
    }),
  ).current;

  const onLayout = (e: LayoutChangeEvent) => {
    layout.current = { w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height };
  };

  return (
    <View style={styles.fill} onLayout={onLayout} testID="anatomy-viewer">
      <View style={styles.fill} {...panResponder.panHandlers}>
        <GLView style={styles.fill} onContextCreate={onContextCreate} />
      </View>

      {/* control buttons */}
      <View style={[styles.controls, { top: insets.top + 64, pointerEvents: "box-none" }]}>
        <TouchableOpacity style={styles.ctrlBtn} onPress={() => engineRef.current?.zoom(0.82)} testID="zoom-in-btn">
          <Ionicons name="add" size={22} color="#E6F0FF" />
        </TouchableOpacity>
        <TouchableOpacity style={styles.ctrlBtn} onPress={() => engineRef.current?.zoom(1.22)} testID="zoom-out-btn">
          <Ionicons name="remove" size={22} color="#E6F0FF" />
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.ctrlBtn}
          onPress={() => {
            engineRef.current?.resetView();
            onSelect?.(null);
          }}
          testID="reset-view-btn"
        >
          <Ionicons name="refresh" size={20} color="#E6F0FF" />
        </TouchableOpacity>
      </View>

      {!ready && !error && (
        <View style={[styles.overlay, { pointerEvents: "none" }]}>
          <ActivityIndicator color="#34C7FF" size="large" />
          <Text style={styles.overlayText}>Loading anatomy model…</Text>
        </View>
      )}
      {error && (
        <View style={styles.overlay}>
          <Ionicons name="warning-outline" size={28} color="#FFB020" />
          <Text style={styles.overlayText}>Could not load model</Text>
          <Text style={styles.errText}>{error}</Text>
        </View>
      )}
    </View>
  );
});

const styles = StyleSheet.create({
  fill: { flex: 1 },
  controls: { position: "absolute", right: 12, gap: 10 },
  ctrlBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "rgba(18,24,34,0.82)",
    borderWidth: 1,
    borderColor: "rgba(120,160,220,0.25)",
    alignItems: "center",
    justifyContent: "center",
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    backgroundColor: "rgba(7,10,15,0.4)",
  },
  overlayText: { color: "#C7D4E6", fontSize: 14, fontWeight: "600" },
  errText: { color: "#8A93A3", fontSize: 11, paddingHorizontal: 32, textAlign: "center" },
});
