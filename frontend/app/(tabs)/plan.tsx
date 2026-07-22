// Plan tab — the new primary screen of Muscle Map AI.
//
// State machine (persisted in `planStore`):
//   step === 0        → Welcome
//   step === 1..6     → Onboarding steps
//   step === 7        → Building (transition)
//   step === 100      → Weekly plan / Workout day
//
// Onboarding shows once; on subsequent launches we jump straight to the
// user's saved plan.

import React, { useEffect, useState } from "react";

import { usePlanStore } from "@/src/plan/planStore";
import {
  Welcome, StepGoal, StepExp, StepDays, StepEquip, StepFocus, StepPosture, Building,
} from "@/src/plan/OnboardingFlow";
import { WeeklyPlan, WorkoutDay } from "@/src/plan/PlanViews";
import { LoadingScreen } from "@/src/theme/LoadingScreen";

export default function PlanTab() {
  const hydrated = usePlanStore(s => s.hydrated);
  const hydrate = usePlanStore(s => s.hydrate);
  const step = usePlanStore(s => s.step);
  const plan = usePlanStore(s => s.plan);
  const setStep = usePlanStore(s => s.setStep);

  const [dayIdx, setDayIdx] = useState<number | null>(null);

  useEffect(() => { hydrate(); }, [hydrate]);

  if (!hydrated) {
    return <LoadingScreen />;
  }

  if (step === 0)  return <Welcome />;
  if (step === 1)  return <StepGoal />;
  if (step === 2)  return <StepExp />;
  if (step === 3)  return <StepDays />;
  if (step === 4)  return <StepEquip />;
  if (step === 5)  return <StepFocus />;
  if (step === 6)  return <StepPosture />;
  if (step === 7)  return <Building />;

  // step === 100: plan ready
  if (!plan) {
    // Shouldn't happen — but guard by sending them back to onboarding.
    return <Welcome />;
  }
  if (dayIdx !== null) {
    return <WorkoutDay dayIndex={dayIdx} onBack={() => setDayIdx(null)} />;
  }
  return <WeeklyPlan onOpenDay={(i) => setDayIdx(i)} onEdit={() => setStep(1)} />;
}
