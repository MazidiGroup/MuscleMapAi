// Development-only review surface for the fifteen shared State System
// components. Not linked from navigation; renders nothing outside __DEV__.
// It exists so Phase 1 screenshots can be captured without shipping
// journey-specific state screens.

import React, { useState } from "react";
import { ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useSemanticTokens } from "@/src/theme/semantic";
import {
  ActionButton,
  BlockingError,
  DestructiveConfirm,
  EmptyState,
  ErrorBanner,
  InfoBanner,
  InterruptedSessionCard,
  LayoutSkeleton,
  LocalAssetFallback,
  OfflineBanner,
  OwnerEmptyState,
  PartialSuccessPanel,
  RetryPanel,
  StatusAnnouncement,
  WarningBanner,
} from "@/src/ui/state";

function Section({ n, name, children }: { n: string; name: string; children: React.ReactNode }) {
  const t = useSemanticTokens();
  return (
    <View style={{ gap: t.space.sm }}>
      <Text style={{ ...t.type.label, color: t.color.textFaint }}>{`${n} · ${name}`}</Text>
      {children}
    </View>
  );
}

export default function StateSystemReview() {
  const t = useSemanticTokens();
  const insets = useSafeAreaInsets();
  const [confirm, setConfirm] = useState(false);

  if (!__DEV__) {
    return (
      <View style={{ flex: 1, backgroundColor: t.color.bg, alignItems: "center", justifyContent: "center" }}>
        <Text style={{ ...t.type.body, color: t.color.textMuted }}>Not available.</Text>
      </View>
    );
  }

  return (
    <ScrollView
      testID="state-system-review"
      style={{ flex: 1, backgroundColor: t.color.bg }}
      contentContainerStyle={{
        padding: t.space.lg,
        paddingTop: insets.top + t.space.lg,
        paddingBottom: insets.bottom + t.space.xxl,
        gap: t.space.xl,
      }}
    >
      <Text style={{ ...t.type.title, color: t.color.text }}>State System</Text>

      <Section n="01" name="Inline information banner">
        <InfoBanner title="Plan saved on this device" message="Your week is stored locally and stays available offline." />
      </Section>
      <Section n="02" name="Offline banner">
        <OfflineBanner
          stillWorks="Your saved Plan, logging and History still work."
          needsConnection="Building a new Plan needs a connection."
        />
      </Section>
      <Section n="03" name="Warning banner">
        <WarningBanner
          title="Some records are unresolved"
          message="Two older workouts could not be matched to this profile."
          consequence="They are excluded from your totals until they can be checked."
        />
      </Section>
      <Section n="04" name="Error banner">
        <ErrorBanner title="Set not saved" message="The last set is still on screen. Tap Save set to store it again." />
      </Section>
      <Section n="05" name="Full-page empty state">
        <View style={{ height: 320, borderRadius: t.radius.lg, }}>
          <EmptyState
            icon="calendar-outline"
            title="No plan yet"
            body="Answer three quick questions and your first week is ready in under a minute."
            primary={{ label: "Build my free plan", onPress: () => {} }}
          />
        </View>
      </Section>
      <Section n="06" name="Full-page blocking error">
        <View style={{ height: 320, borderRadius: t.radius.lg, }}>
          <BlockingError
            title="This device storage is unavailable"
            body="Nothing was lost. Your saved workouts are still on this device and will appear once storage responds."
            primary={{ label: "Try again", onPress: () => {} }}
            secondary={{ label: "Go to Plan", onPress: () => {} }}
            detail="Storage read failed"
          />
        </View>
      </Section>
      <Section n="07" name="Layout skeleton">
        <LayoutSkeleton rows={2} />
      </Section>
      <Section n="08" name="Button loading state">
        <View style={{ gap: t.space.sm }}>
          <ActionButton label="Start workout" onPress={() => {}} />
          <ActionButton label="Start workout" busy busyLabel="Starting" onPress={() => {}} />
          <ActionButton label="Start workout" disabled onPress={() => {}} />
        </View>
      </Section>
      <Section n="09" name="Retry panel">
        <RetryPanel
          title="We couldn't build your new plan"
          body="Your answers are saved and your current plan is unchanged."
          preserved={["Your three answers are saved", "Your current week is unchanged"]}
          retry={{ label: "Try again", onPress: () => {} }}
          secondary={{ label: "Keep my current plan", onPress: () => {} }}
          attempt={2}
          note="Nothing retries on its own — this is always your choice."
        />
      </Section>
      <Section n="10" name="Partial-success panel">
        <PartialSuccessPanel
          title="Most of your history is ready"
          body="Older records that could not be checked are left out of your totals."
          succeeded={["18 workouts available", "Personal records recalculated"]}
          omitted={["2 workouts held for review"]}
          action={{ label: "What does this mean?", onPress: () => {} }}
        />
      </Section>
      <Section n="11" name="Local-asset fallback">
        <LocalAssetFallback height={120} />
      </Section>
      <Section n="12" name="Interrupted-session recovery card">
        <InterruptedSessionCard
          title="Pick up where you left off"
          body="Your session is still open on this device with everything you logged."
          facts={[
            ["Sets logged", "6"],
            ["Exercises", "3"],
            ["Started", "18:40"],
          ]}
          resume={{ label: "Resume workout", onPress: () => {} }}
          discard={{ label: "Not now", onPress: () => {} }}
        />
      </Section>
      <Section n="13" name="Destructive confirmation">
        <ActionButton label="Show destructive confirmation" variant="secondary" onPress={() => setConfirm(true)} />
        <DestructiveConfirm
          visible={confirm}
          title="Sign out of this account?"
          body="Your workouts stay saved on this device for this account. You'll go back to your guest profile and can sign in again at any time."
          confirmLabel="Sign out"
          onConfirm={() => setConfirm(false)}
          onCancel={() => setConfirm(false)}
        />
      </Section>
      <Section n="14" name="Owner-namespace empty state">
        <View style={{ height: 320, borderRadius: t.radius.lg, }}>
          <OwnerEmptyState
            title="No workouts on this profile yet"
            body="Finish a workout and it will appear here."
            primary={{ label: "Go to Plan", onPress: () => {} }}
          />
        </View>
      </Section>
      <Section n="15" name="Accessible status announcement">
        <StatusAnnouncement message="Reading your plan from this device" />
      </Section>
    </ScrollView>
  );
}
