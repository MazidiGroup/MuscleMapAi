// Plan tab — the primary screen of Muscle Map AI.
//
// State machine (persisted per owner in `planStore`):
//   step 0            → Welcome (two actions only)
//   step 1..3         → the three onboarding questions
//   local "building"  → plan generation (never persisted, so a relaunch can't
//                       strand the user on a transition screen)
//   step 100          → weekly plan / workout day
//
// Steps written by the retired six-question flow are mapped forward by
// `routeStep`, which preserves whatever the user had already selected.

import React, { useCallback, useEffect, useState } from "react";
import { useRouter } from "expo-router";

import { usePlanStore } from "@/src/plan/planStore";
import { Building, Onboarding, PlanBuildError, Welcome } from "@/src/plan/OnboardingFlow";
import { ONBOARDING_STEP_COUNT, STEP_WELCOME, normalizeAnswers, routeStep } from "@/src/plan/onboarding";
import { WeeklyPlan, WorkoutDay } from "@/src/plan/PlanViews";
import { LoadingScreen } from "@/src/theme/LoadingScreen";

type Phase = "idle" | "building" | "failed";

export default function PlanTab() {
  const router = useRouter();
  const hydrated = usePlanStore((s) => s.hydrated);
  const hydrate = usePlanStore((s) => s.hydrate);
  const step = usePlanStore((s) => s.step);
  const plan = usePlanStore((s) => s.plan);
  const setStep = usePlanStore((s) => s.setStep);

  const [phase, setPhase] = useState<Phase>("idle");
  const [dayIdx, setDayIdx] = useState<number | null>(null);

  useEffect(() => {
    hydrate();
  }, [hydrate]);

  const build = useCallback(() => {
    setPhase("building");
    // A short, honest transition — the generator itself is local and instant.
    setTimeout(() => {
      try {
        const { answers, rebuildFromAnswers } = usePlanStore.getState();
        rebuildFromAnswers(normalizeAnswers(answers));
        setPhase("idle");
      } catch (e) {
        console.error("[Plan] buildPlan failed:", e);
        setPhase("failed");
      }
    }, 1200);
  }, []);

  if (!hydrated) return <LoadingScreen />;
  if (phase === "building") return <Building />;
  if (phase === "failed") {
    return (
      <PlanBuildError
        onRetry={build}
        onEdit={() => {
          setPhase("idle");
          setStep(1);
        }}
      />
    );
  }

  const routed = routeStep(step, !!plan);

  if (routed === STEP_WELCOME || (!plan && routed > ONBOARDING_STEP_COUNT)) {
    return <Welcome onStart={() => setStep(1)} onSignIn={() => router.push("/login")} />;
  }
  if (routed <= ONBOARDING_STEP_COUNT) return <Onboarding onComplete={build} />;

  if (dayIdx !== null) return <WorkoutDay dayIndex={dayIdx} onBack={() => setDayIdx(null)} />;
  return <WeeklyPlan onOpenDay={(i) => setDayIdx(i)} onEditAnswers={() => setStep(1)} />;
}
