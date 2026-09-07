import { Redirect } from "expo-router";

// Cold launch must never land on a Premium-gated tab (Coach or Explore).
// Plan is the always-available entry point: onboarding runs there in front of
// the Premium wall, and the wall itself stands above every route.
export default function Index() {
  return <Redirect href="/(tabs)/plan" />;
}
