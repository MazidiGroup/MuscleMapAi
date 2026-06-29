import React, { useRef, useState, useMemo, useEffect } from "react";
import { View, StyleSheet, Platform, PanResponder } from "react-native";
import { Canvas, useFrame } from "@react-three/fiber/native";
import * as THREE from "three";

import { COLORS } from "@/src/theme";
import { MuscleMap, MuscleStatus } from "./BodyDiagram";

const STATUS_COLOR: Record<MuscleStatus, string> = {
  green: "#34D399",
  yellow: "#F59E0B",
  red: "#EF4444",
  none: "#5C5C66",
};
const SKIN = "#A8836A";
const BONE = "#E6DCC8";

type Props = {
  muscles: MuscleMap;
  size?: number;
  onPressMuscle?: (group: string) => void;
  viewSnap?: "front" | "back" | "side";
};

function colorFor(status: MuscleStatus | undefined): string {
  if (!status || status === "none") return SKIN;
  return STATUS_COLOR[status];
}

/** A single muscle group rendered as one or more deformed primitives. */
function Muscle({
  group,
  status,
  children,
}: {
  group: string;
  status: MuscleStatus | undefined;
  children: (props: { color: string; emissive: string; metalness: number; roughness: number }) => React.ReactNode;
}) {
  const color = colorFor(status);
  const emissive = !status || status === "none" ? "#000000" : color;
  return <>{children({ color, emissive, metalness: 0.05, roughness: 0.55 })}</>;
}

function HumanModel({ muscles, rotY, rotX }: { muscles: MuscleMap; rotY: number; rotX: number }) {
  const groupRef = useRef<THREE.Group>(null);

  useFrame(() => {
    if (groupRef.current) {
      // Smoothly approach the target rotation
      groupRef.current.rotation.y += (rotY - groupRef.current.rotation.y) * 0.18;
      groupRef.current.rotation.x += (rotX - groupRef.current.rotation.x) * 0.18;
    }
  });

  const matProps = (g: keyof MuscleMap) => {
    const c = colorFor(muscles[g]);
    const isHighlighted = muscles[g] && muscles[g] !== "none";
    return {
      color: c,
      emissive: isHighlighted ? c : "#000",
      emissiveIntensity: isHighlighted ? 0.15 : 0,
      metalness: 0.08,
      roughness: 0.5,
    };
  };

  const skinMat = { color: SKIN, metalness: 0.05, roughness: 0.65 };
  const boneMat = { color: BONE, metalness: 0.2, roughness: 0.35 };

  return (
    <group ref={groupRef} position={[0, -0.2, 0]} scale={1.1}>
      {/* Spine (visible behind muscles, slightly back) */}
      <mesh position={[0, 0.45, -0.15]}>
        <cylinderGeometry args={[0.04, 0.04, 1.6, 8]} />
        <meshStandardMaterial {...boneMat} />
      </mesh>

      {/* Skull */}
      <mesh position={[0, 1.45, 0]}>
        <sphereGeometry args={[0.22, 32, 32]} />
        <meshStandardMaterial color="#D9CFB8" metalness={0.1} roughness={0.55} />
      </mesh>
      {/* Jaw / lower face hint */}
      <mesh position={[0, 1.32, 0.05]} scale={[0.85, 0.6, 0.85]}>
        <sphereGeometry args={[0.18, 24, 24]} />
        <meshStandardMaterial color="#C7BBA0" metalness={0.05} roughness={0.6} />
      </mesh>

      {/* Neck */}
      <mesh position={[0, 1.18, 0]}>
        <cylinderGeometry args={[0.085, 0.1, 0.18, 16]} />
        <meshStandardMaterial {...skinMat} />
      </mesh>

      {/* Ribcage (skeleton hint behind chest) */}
      <mesh position={[0, 0.78, -0.04]} scale={[1, 1.1, 0.55]}>
        <sphereGeometry args={[0.27, 24, 24]} />
        <meshStandardMaterial color="#E2D9C2" metalness={0.2} roughness={0.4} />
      </mesh>

      {/* === CHEST (pecs) === */}
      <group>
        <mesh position={[-0.12, 0.85, 0.18]} rotation={[0, 0.2, 0.1]} scale={[1.15, 0.7, 0.7]}>
          <sphereGeometry args={[0.13, 24, 24]} />
          <meshStandardMaterial {...matProps("chest")} />
        </mesh>
        <mesh position={[0.12, 0.85, 0.18]} rotation={[0, -0.2, -0.1]} scale={[1.15, 0.7, 0.7]}>
          <sphereGeometry args={[0.13, 24, 24]} />
          <meshStandardMaterial {...matProps("chest")} />
        </mesh>
      </group>

      {/* === SHOULDERS (delts) === */}
      <mesh position={[-0.32, 0.92, 0]} scale={[1, 1, 0.95]}>
        <sphereGeometry args={[0.11, 24, 24]} />
        <meshStandardMaterial {...matProps("shoulders")} />
      </mesh>
      <mesh position={[0.32, 0.92, 0]} scale={[1, 1, 0.95]}>
        <sphereGeometry args={[0.11, 24, 24]} />
        <meshStandardMaterial {...matProps("shoulders")} />
      </mesh>

      {/* Upper back / traps (visible from back, slight bulge above shoulders) */}
      <mesh position={[0, 0.97, -0.12]} scale={[1.4, 0.5, 0.8]}>
        <sphereGeometry args={[0.13, 24, 24]} />
        <meshStandardMaterial {...matProps("back")} />
      </mesh>

      {/* === BACK (lats spread wide) === */}
      <mesh position={[-0.22, 0.62, -0.12]} rotation={[0, 0, -0.15]} scale={[0.8, 1.5, 0.55]}>
        <sphereGeometry args={[0.16, 24, 24]} />
        <meshStandardMaterial {...matProps("back")} />
      </mesh>
      <mesh position={[0.22, 0.62, -0.12]} rotation={[0, 0, 0.15]} scale={[0.8, 1.5, 0.55]}>
        <sphereGeometry args={[0.16, 24, 24]} />
        <meshStandardMaterial {...matProps("back")} />
      </mesh>
      {/* Lower back */}
      <mesh position={[0, 0.35, -0.13]} scale={[1.2, 0.6, 0.5]}>
        <sphereGeometry args={[0.15, 24, 24]} />
        <meshStandardMaterial {...matProps("back")} />
      </mesh>

      {/* === ARMS — biceps, triceps, forearms === */}
      {/* Left arm */}
      <group position={[-0.38, 0.78, 0]}>
        {/* Biceps */}
        <mesh position={[0, -0.18, 0.04]} rotation={[0, 0, 0.08]} scale={[0.9, 1.4, 0.95]}>
          <sphereGeometry args={[0.085, 20, 20]} />
          <meshStandardMaterial {...matProps("arms")} />
        </mesh>
        {/* Triceps (back side) */}
        <mesh position={[0, -0.18, -0.06]} rotation={[0, 0, 0.08]} scale={[0.85, 1.3, 0.9]}>
          <sphereGeometry args={[0.082, 20, 20]} />
          <meshStandardMaterial {...matProps("arms")} />
        </mesh>
        {/* Forearm */}
        <mesh position={[0.02, -0.5, 0]} rotation={[0, 0, 0.1]} scale={[0.85, 1.6, 0.85]}>
          <sphereGeometry args={[0.075, 20, 20]} />
          <meshStandardMaterial {...matProps("arms")} />
        </mesh>
      </group>
      {/* Right arm */}
      <group position={[0.38, 0.78, 0]}>
        <mesh position={[0, -0.18, 0.04]} rotation={[0, 0, -0.08]} scale={[0.9, 1.4, 0.95]}>
          <sphereGeometry args={[0.085, 20, 20]} />
          <meshStandardMaterial {...matProps("arms")} />
        </mesh>
        <mesh position={[0, -0.18, -0.06]} rotation={[0, 0, -0.08]} scale={[0.85, 1.3, 0.9]}>
          <sphereGeometry args={[0.082, 20, 20]} />
          <meshStandardMaterial {...matProps("arms")} />
        </mesh>
        <mesh position={[-0.02, -0.5, 0]} rotation={[0, 0, -0.1]} scale={[0.85, 1.6, 0.85]}>
          <sphereGeometry args={[0.075, 20, 20]} />
          <meshStandardMaterial {...matProps("arms")} />
        </mesh>
      </group>

      {/* === CORE (abs) — six-pack layered === */}
      {[0.65, 0.5, 0.35, 0.2].map((y, i) => (
        <group key={i}>
          <mesh position={[-0.06, y, 0.14]} scale={[0.85, 0.6, 0.6]}>
            <sphereGeometry args={[0.06, 16, 16]} />
            <meshStandardMaterial {...matProps("core")} />
          </mesh>
          <mesh position={[0.06, y, 0.14]} scale={[0.85, 0.6, 0.6]}>
            <sphereGeometry args={[0.06, 16, 16]} />
            <meshStandardMaterial {...matProps("core")} />
          </mesh>
        </group>
      ))}
      {/* Obliques */}
      <mesh position={[-0.18, 0.45, 0.06]} scale={[0.5, 1.3, 0.5]}>
        <sphereGeometry args={[0.1, 20, 20]} />
        <meshStandardMaterial {...matProps("core")} />
      </mesh>
      <mesh position={[0.18, 0.45, 0.06]} scale={[0.5, 1.3, 0.5]}>
        <sphereGeometry args={[0.1, 20, 20]} />
        <meshStandardMaterial {...matProps("core")} />
      </mesh>

      {/* === PELVIS (skin hint) === */}
      <mesh position={[0, 0.08, 0]} scale={[1.05, 0.55, 0.85]}>
        <sphereGeometry args={[0.18, 24, 24]} />
        <meshStandardMaterial {...skinMat} />
      </mesh>

      {/* === GLUTES (back) === */}
      <mesh position={[-0.1, 0.05, -0.18]} scale={[1.1, 1.1, 0.8]}>
        <sphereGeometry args={[0.12, 24, 24]} />
        <meshStandardMaterial {...matProps("glutes")} />
      </mesh>
      <mesh position={[0.1, 0.05, -0.18]} scale={[1.1, 1.1, 0.8]}>
        <sphereGeometry args={[0.12, 24, 24]} />
        <meshStandardMaterial {...matProps("glutes")} />
      </mesh>

      {/* === QUADS (front of thighs) === */}
      <mesh position={[-0.12, -0.28, 0.06]} scale={[0.95, 2, 0.95]}>
        <sphereGeometry args={[0.1, 24, 24]} />
        <meshStandardMaterial {...matProps("quads")} />
      </mesh>
      <mesh position={[0.12, -0.28, 0.06]} scale={[0.95, 2, 0.95]}>
        <sphereGeometry args={[0.1, 24, 24]} />
        <meshStandardMaterial {...matProps("quads")} />
      </mesh>

      {/* === HAMSTRINGS (back of thighs) === */}
      <mesh position={[-0.12, -0.28, -0.08]} scale={[0.9, 2, 0.9]}>
        <sphereGeometry args={[0.095, 24, 24]} />
        <meshStandardMaterial {...matProps("hamstrings")} />
      </mesh>
      <mesh position={[0.12, -0.28, -0.08]} scale={[0.9, 2, 0.9]}>
        <sphereGeometry args={[0.095, 24, 24]} />
        <meshStandardMaterial {...matProps("hamstrings")} />
      </mesh>

      {/* Knees (bone hint) */}
      <mesh position={[-0.12, -0.65, 0]}>
        <sphereGeometry args={[0.07, 16, 16]} />
        <meshStandardMaterial {...boneMat} />
      </mesh>
      <mesh position={[0.12, -0.65, 0]}>
        <sphereGeometry args={[0.07, 16, 16]} />
        <meshStandardMaterial {...boneMat} />
      </mesh>

      {/* === CALVES === */}
      <mesh position={[-0.12, -0.92, -0.02]} scale={[0.9, 1.8, 0.95]}>
        <sphereGeometry args={[0.085, 24, 24]} />
        <meshStandardMaterial {...matProps("calves")} />
      </mesh>
      <mesh position={[0.12, -0.92, -0.02]} scale={[0.9, 1.8, 0.95]}>
        <sphereGeometry args={[0.085, 24, 24]} />
        <meshStandardMaterial {...matProps("calves")} />
      </mesh>

      {/* Feet */}
      <mesh position={[-0.12, -1.22, 0.05]} scale={[1, 0.45, 1.6]}>
        <sphereGeometry args={[0.07, 16, 16]} />
        <meshStandardMaterial {...skinMat} />
      </mesh>
      <mesh position={[0.12, -1.22, 0.05]} scale={[1, 0.45, 1.6]}>
        <sphereGeometry args={[0.07, 16, 16]} />
        <meshStandardMaterial {...skinMat} />
      </mesh>
    </group>
  );
}

export function Body3D({ muscles, size = 280, viewSnap }: Props) {
  const [rotY, setRotY] = useState(0);
  const [rotX, setRotX] = useState(0);
  const lastTouch = useRef({ x: 0, y: 0 });
  const baseRot = useRef({ y: 0, x: 0 });

  // Snap to view when the toggle changes (programmatic rotation)
  useEffect(() => {
    if (!viewSnap) return;
    if (viewSnap === "front") setRotY(0);
    else if (viewSnap === "back") setRotY(Math.PI);
    else if (viewSnap === "side") setRotY(Math.PI / 2);
    setRotX(0);
  }, [viewSnap]);

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderGrant: (_, gestureState) => {
          lastTouch.current = { x: gestureState.x0, y: gestureState.y0 };
          baseRot.current = { y: rotY, x: rotX };
        },
        onPanResponderMove: (_, gestureState) => {
          const dx = gestureState.moveX - lastTouch.current.x;
          const dy = gestureState.moveY - lastTouch.current.y;
          const newY = baseRot.current.y + dx * 0.012;
          const newX = Math.max(-0.8, Math.min(0.8, baseRot.current.x + dy * 0.008));
          setRotY(newY);
          setRotX(newX);
        },
      }),
    [rotY, rotX],
  );

  return (
    <View style={[styles.container, { width: size, height: size * 1.85 }]} {...panResponder.panHandlers} testID="body-3d-canvas">
      <Canvas
        camera={{ position: [0, -0.1, 5.5], fov: 28 }}
        gl={{ antialias: true, alpha: true }}
        style={{ flex: 1 }}
      >
        <ambientLight intensity={0.55} />
        <directionalLight position={[3, 4, 5]} intensity={1.2} />
        <directionalLight position={[-3, 2, -3]} intensity={0.6} color="#7AB8FF" />
        <pointLight position={[0, 2, 4]} intensity={0.4} />
        <HumanModel muscles={muscles} rotY={rotY} rotX={rotX} />
      </Canvas>
    </View>
  );
}

export function snapTo(view: "front" | "back" | "side", setRotY: (n: number) => void) {
  if (view === "front") setRotY(0);
  else if (view === "back") setRotY(Math.PI);
  else if (view === "side") setRotY(Math.PI / 2);
}

const styles = StyleSheet.create({
  container: { alignSelf: "center", borderRadius: 16, overflow: "hidden" },
});
