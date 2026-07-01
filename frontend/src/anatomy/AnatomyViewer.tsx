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
  Platform,
} from "react-native";
import { GLView } from "expo-gl";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Asset } from "expo-asset";
import * as FileSystem from "expo-file-system/legacy";

import { AnatomyEngine } from "./engine";

// Model bundled into the app so production (TestFlight) builds never depend on a
// remote asset at runtime. Requires glb in metro assetExts.
const MODEL_MODULE = require("../../assets/models/ecorche.glb");
// Remote HTTPS fallback (served by backend) if the bundled asset can't be read.
const MODEL_URL = `${process.env.EXPO_PUBLIC_BACKEND_URL || ""}/api/anatomy/model`;

// Cache the model buffer across mounts (so tab switches are instant).
let cachedBuffer: ArrayBuffer | null = null;

function base64ToArrayBuffer(b64: string): ArrayBuffer {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  const lookup = new Uint8Array(256);
  for (let i = 0; i < chars.length; i++) lookup[chars.charCodeAt(i)] = i;
  let len = b64.length;
  if (b64[len - 1] === "=") len--;
  if (b64[len - 1] === "=") len--;
  const bytes = new Uint8Array((len * 3) >> 2);
  let p = 0;
  for (let i = 0; i < b64.length; i += 4) {
    const e0 = lookup[b64.charCodeAt(i)];
    const e1 = lookup[b64.charCodeAt(i + 1)];
    const e2 = lookup[b64.charCodeAt(i + 2)];
    const e3 = lookup[b64.charCodeAt(i + 3)];
    bytes[p++] = (e0 << 2) | (e1 >> 4);
    if (p < bytes.length) bytes[p++] = ((e1 & 15) << 4) | (e2 >> 2);
    if (p < bytes.length) bytes[p++] = ((e2 & 3) << 6) | e3;
  }
  return bytes.buffer;
}

// Resolve the model bytes: bundled asset first, HTTPS remote as a fallback.
async function getModelBuffer(): Promise<ArrayBuffer> {
  if (cachedBuffer) return cachedBuffer.slice(0);

  // 1) Bundled asset (offline-safe, no ATS/HTTP issues)
  try {
    const asset = Asset.fromModule(MODEL_MODULE);
    await asset.downloadAsync();
    const uri = asset.localUri || asset.uri;
    if (uri) {
      let buf: ArrayBuffer | undefined;
      if (Platform.OS === "web" || uri.startsWith("http")) {
        const res = await fetch(uri);
        if (res.ok) buf = await res.arrayBuffer();
      } else {
        const b64 = await FileSystem.readAsStringAsync(uri, { encoding: "base64" });
        buf = base64ToArrayBuffer(b64);
      }
      if (buf && buf.byteLength > 0) {
        cachedBuffer = buf;
        return cachedBuffer.slice(0);
      }
    }
  } catch {
    // fall through to remote
  }

  // 2) Remote HTTPS fallback
  const res = await fetch(MODEL_URL);
  if (!res.ok) throw new Error(`Model fetch failed (${res.status})`);
  cachedBuffer = await res.arrayBuffer();
  return cachedBuffer.slice(0);
}

export type ViewerHandle = {
  resetView: () => void;
  focusUnit: (name: string) => void;
  focusContainer: (name: string | null) => void;
};

type Props = {
  mode?: "explore" | "workout" | "recovery";
  primary?: string[];
  secondary?: string[];
  recovery?: Record<string, string>;
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
  { mode = "explore", primary = [], secondary = [], recovery = {}, shrink = 0, hidden = [], isolate = null, onSelect, onReady },
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
    if (ready) engineRef.current?.setRecovery(recovery);
  }, [JSON.stringify(recovery), ready]);
  useEffect(() => {
    if (ready) engineRef.current?.setShrink(shrink);
  }, [shrink, ready]);
  useEffect(() => {
    if (ready) engineRef.current?.setHidden(hidden);
  }, [JSON.stringify(hidden), ready]);
  useEffect(() => {
    if (ready) engineRef.current?.focusContainer(isolate ?? null);
  }, [isolate, ready]);

  const loadModelIntoEngine = useCallback(async () => {
    const engine = engineRef.current;
    if (!engine) return;
    setError(null);
    try {
      const buffer = await getModelBuffer();
      if (!buffer || buffer.byteLength === 0) throw new Error("Model data unavailable");
      // clone the buffer because GLTFLoader may take ownership of it
      await engine.loadModel(buffer.slice(0));
    } catch (e: any) {
      setError(String(e?.message || e) || "Could not load model");
    }
  }, []);

  const onContextCreate = useCallback(async (gl: any) => {
    const engine = new AnatomyEngine(gl, {
      onReady: () => {
        setReady(true);
        // apply initial state
        engine.setMode(mode);
        engine.setHighlight(primary, secondary);
        engine.setRecovery(recovery);
        engine.setShrink(shrink);
        engine.setHidden(hidden);
        if (isolate) engine.focusContainer(isolate);
        onReady?.();
      },
      onError: (msg) => setError(msg),
    });
    engineRef.current = engine;
    await loadModelIntoEngine();
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
          <TouchableOpacity style={styles.retryBtn} onPress={loadModelIntoEngine} testID="model-retry">
            <Ionicons name="refresh" size={16} color="#070A0F" />
            <Text style={styles.retryText}>Retry</Text>
          </TouchableOpacity>
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
  retryBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 8,
    backgroundColor: "#34C7FF",
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 999,
  },
  retryText: { color: "#070A0F", fontSize: 14, fontWeight: "800" },
});
