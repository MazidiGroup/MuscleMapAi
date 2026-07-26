// Add an exercise to a workout from the Library.
//
// This sheet performs NO mutation of its own: it calls the verified Phase 2
// session operation and then confirms the result by reading the session back.
// Routing follows the frozen Library design — an active workout, a planned
// workout, or no Plan at all.

import React, { useEffect, useState } from "react";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";

import { useSemanticTokens } from "@/src/theme/semantic";
import { ActionButton, InfoBanner, StatusAnnouncement, WarningBanner } from "@/src/ui/state";
import { useWorkout } from "@/src/anatomy/workoutStore";
import { usePlanStore } from "@/src/plan/planStore";

import { ADD_COPY, isAlreadyInSession, resolveAddContext } from "./addRouting";

type Phase = "choose" | "added" | "already" | "unverified";

export function AddToWorkoutSheet({
  visible,
  exerciseId,
  exerciseName,
  onDismiss,
}: {
  visible: boolean;
  exerciseId: string;
  exerciseName: string;
  onDismiss: () => void;
}) {
  const t = useSemanticTokens();
  const router = useRouter();
  const w = useWorkout();
  const plan = usePlanStore((s) => s.plan);
  const [phase, setPhase] = useState<Phase>("choose");

  const context = resolveAddContext({ hasActiveSession: w.session !== null, plan });

  useEffect(() => {
    if (visible) setPhase("choose");
  }, [visible]);

  // Verification: the exercise must actually be in the session afterwards.
  useEffect(() => {
    if (phase !== "added") return;
    const ok = isAlreadyInSession(w.session, exerciseId, "anatomy");
    if (!ok) setPhase("unverified");
  }, [phase, w.session, exerciseId]);

  const openSession = () => {
    onDismiss();
    router.push({ pathname: "/(tabs)/workout", params: { seg: "session" } });
  };

  const add = () => {
    if (isAlreadyInSession(w.session, exerciseId, "anatomy")) {
      setPhase("already");
      return;
    }
    w.addExercise(exerciseId); // the verified Phase 2 mutation, exact id preserved
    setPhase("added");
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onDismiss}>
      <Pressable
        style={[styles.backdrop, { backgroundColor: t.color.scrim }]}
        onPress={onDismiss}
        accessibilityRole="button"
        accessibilityLabel="Close"
      />
      <View
        style={[styles.sheet, { backgroundColor: t.color.surface, borderColor: t.color.border, padding: t.space.xl, gap: t.space.md }]}
        testID="add-to-workout-sheet"
      >
        <Text style={[t.type.heading, { color: t.color.text }]}>{exerciseName}</Text>

        {phase === "already" && (
          <>
            <InfoBanner message={ADD_COPY.alreadyThere(exerciseName)} testID="add-already" />
            <ActionButton label="View active workout" onPress={openSession} testID="add-view-session" />
            <ActionButton label="Cancel" variant="secondary" onPress={onDismiss} testID="add-cancel" />
          </>
        )}

        {phase === "added" && (
          <>
            {/* The banner below already shows this line; announce it once, invisibly. */}
            <StatusAnnouncement message={ADD_COPY.addedExtra} visible={false} />
            <InfoBanner message={ADD_COPY.addedExtra} testID="add-success" />
            <ActionButton label="Go to workout" onPress={openSession} testID="add-goto-session" />
            <ActionButton label="Keep browsing" variant="secondary" onPress={onDismiss} testID="add-keep-browsing" />
          </>
        )}

        {phase === "unverified" && (
          <>
            <WarningBanner
              title="Couldn’t confirm that change"
              message={ADD_COPY.unverified}
              consequence="Your workout is unchanged."
              testID="add-unverified"
            />
            <ActionButton label="Check today’s session" onPress={openSession} testID="add-check-session" />
            <ActionButton label="Close" variant="secondary" onPress={onDismiss} testID="add-close" />
          </>
        )}

        {phase === "choose" && context.kind === "active" && (
          <>
            <InfoBanner title={ADD_COPY.activeTitle} message={ADD_COPY.onlyLine} testID="add-active-context" />
            <ActionButton label="Add to active workout" onPress={add} testID="add-to-active" />
            <ActionButton label="View active workout" variant="secondary" onPress={openSession} testID="add-view-active" />
            <ActionButton label="Cancel" variant="secondary" onPress={onDismiss} testID="add-cancel" />
          </>
        )}

        {phase === "choose" && context.kind === "planned" && (
          <>
            <InfoBanner message={ADD_COPY.onlyLine} testID="add-planned-context" />
            <ActionButton label="Add as extra to today’s workout" onPress={add} testID="add-as-extra" />
            <ActionButton label="Cancel" variant="secondary" onPress={onDismiss} testID="add-cancel" />
          </>
        )}

        {phase === "choose" && context.kind === "no-plan" && (
          <>
            <InfoBanner message={ADD_COPY.noPlan} testID="add-no-plan" />
            <ActionButton
              label="Build my free plan"
              onPress={() => {
                onDismiss();
                router.push("/(tabs)/plan");
              }}
              testID="add-build-plan"
            />
            <ActionButton label="Cancel" variant="secondary" onPress={onDismiss} testID="add-cancel" />
          </>
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1 },
  sheet: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderWidth: 1,
  },
});
