// "Adjust plan" confirmation sheet.
//
// Adjusting rebuilds the REMAINING scheduled workouts of the current week from
// the owner's current answers. The user always sees exactly what will change and
// must confirm. The current plan is only replaced once a candidate has been
// verified AND both local writes are confirmed, so a failure leaves the existing
// plan — and the user's selections — untouched.

import React, { useCallback, useEffect, useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { useSemanticTokens } from "@/src/theme/semantic";
import { ActionButton, InfoBanner, RetryPanel, StatusAnnouncement, WarningBanner } from "@/src/ui/state";
import { LiquidSheen } from "@/src/ui/GlassSurface";

import type { AdjustOutcome, AdjustSummary } from "./adjustPlan";
import { usePlanStore } from "./planStore";

const SHORT: Record<string, string> = {
  Monday: "Mon",
  Tuesday: "Tue",
  Wednesday: "Wed",
  Thursday: "Thu",
  Friday: "Fri",
  Saturday: "Sat",
  Sunday: "Sun",
};

const shortList = (days: string[]) => days.map((d) => SHORT[d] || d).join(", ");

export function AdjustPlanSheet({
  visible,
  hasActiveWorkout,
  onDismiss,
}: {
  visible: boolean;
  hasActiveWorkout: boolean;
  onDismiss: () => void;
}) {
  const t = useSemanticTokens();
  const previewAdjust = usePlanStore((s) => s.previewAdjust);
  const publishAdjusted = usePlanStore((s) => s.publishAdjusted);

  const [outcome, setOutcome] = useState<AdjustOutcome | null>(null);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  const preview = useCallback(() => {
    setFailed(false);
    try {
      setOutcome(previewAdjust(hasActiveWorkout));
    } catch {
      // A failed preview is a failed adjust: say so and wait to be asked again.
      setOutcome(null);
      setFailed(true);
    }
  }, [previewAdjust, hasActiveWorkout]);

  useEffect(() => {
    if (visible) preview();
    else {
      setOutcome(null);
      setFailed(false);
      setBusy(false);
    }
  }, [visible, preview]);

  const confirm = async () => {
    if (!outcome || !outcome.ok) return;
    setBusy(true);
    const ok = await publishAdjusted(outcome.plan);
    setBusy(false);
    if (ok) onDismiss();
    else setFailed(true);
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onDismiss}>
      <Pressable style={[styles.backdrop, { backgroundColor: t.color.scrim }]} onPress={onDismiss} accessibilityLabel="Close" />
      <View
        style={[
          styles.sheet,
          { backgroundColor: t.color.surface, borderColor: t.color.border, padding: t.space.xl, gap: t.space.md },
        ]}
        testID="adjust-plan-sheet"
      >
        <LiquidSheen tone="neutral" />
        <Text style={[t.type.heading, { color: t.color.text }]}>Adjust plan</Text>

        <ScrollView style={{ maxHeight: 380 }} contentContainerStyle={{ gap: t.space.md }}>
          {failed ? (
            <RetryPanel
              title="Your plan was not changed"
              body="We couldn't save the new week to this device. You still have your current plan."
              preserved={["Your current plan", "Completed workouts", "Your answers"]}
              retry={{ label: "Try again", onPress: preview, busy, testID: "adjust-retry" }}
              secondary={{ label: "Keep current plan", onPress: onDismiss, testID: "adjust-keep" }}
              testID="adjust-failed"
            />
          ) : !outcome ? (
            <Text style={[t.type.body, { color: t.color.textMuted }]}>Checking your week…</Text>
          ) : !outcome.ok ? (
            <Blocked reason={outcome.reason} onDismiss={onDismiss} />
          ) : (
            <>
              <ChangeSummary summary={outcome.summary} />
              <InfoBanner message="Completed workouts and your History are never changed." testID="adjust-safety-note" />
              <StatusAnnouncement message={`${outcome.summary.rebuiltDays.length} days will be rebuilt.`} />
            </>
          )}
        </ScrollView>

        {!failed && outcome?.ok && (
          <>
            <ActionButton
              label={outcome.summary.noChange ? "Rebuild anyway" : "Rebuild my week"}
              busy={busy}
              busyLabel="Saving your new week"
              onPress={confirm}
              testID="adjust-confirm"
            />
            <ActionButton label="Cancel" variant="secondary" onPress={onDismiss} testID="adjust-cancel" />
          </>
        )}
      </View>
    </Modal>
  );
}

function Blocked({ reason, onDismiss }: { reason: string; onDismiss: () => void }) {
  const t = useSemanticTokens();
  if (reason === "active_workout") {
    return (
      <View style={{ gap: t.space.md }} testID="adjust-blocked-active">
        <WarningBanner
          title="A workout is in progress"
          message="Finish or cancel your active workout first."
          consequence="Adjusting now would replace the session you're logging."
        />
        <ActionButton label="Got it" variant="secondary" onPress={onDismiss} testID="adjust-blocked-ok" />
      </View>
    );
  }
  return (
    <View style={{ gap: t.space.md }} testID="adjust-blocked-other">
      <WarningBanner
        title="We can't adjust this week yet"
        message="Your plan needs to be rebuilt from your answers first."
        consequence="Nothing has been changed."
      />
      <ActionButton label="Close" variant="secondary" onPress={onDismiss} testID="adjust-blocked-close" />
    </View>
  );
}

function ChangeSummary({ summary }: { summary: AdjustSummary }) {
  const t = useSemanticTokens();
  const rows: [string, string][] = [];
  rows.push(["Rebuilding", summary.rebuiltDays.length ? shortList(summary.rebuiltDays) : "Nothing — this week already matches your answers"]);
  if (summary.keptCompletedDays.length) rows.push(["Keeping completed", shortList(summary.keptCompletedDays)]);
  if (summary.addedTrainingDays.length) rows.push(["New training days", shortList(summary.addedTrainingDays)]);
  if (summary.removedTrainingDays.length) rows.push(["Now rest days", shortList(summary.removedTrainingDays)]);
  if (summary.splitBefore !== summary.splitAfter) rows.push(["Split", `${summary.splitBefore} → ${summary.splitAfter}`]);
  rows.push(["Training days", `${summary.daysPerWeek} / week`]);

  return (
    <View style={{ gap: t.space.sm }} testID="adjust-summary">
      {rows.map(([label, value]) => (
        <View key={label} style={styles.row}>
          <Text style={[t.type.label, { color: t.color.textMuted, width: 132 }]}>{label}</Text>
          <Text style={[t.type.bodyStrong, { color: t.color.text, flex: 1 }]}>{value}</Text>
        </View>
      ))}
    </View>
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
    overflow: "hidden",
  },
  row: { flexDirection: "row", alignItems: "flex-start", gap: 8 },
});
