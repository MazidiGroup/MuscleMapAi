import { Redirect } from "expo-router";

// Cold launch must never land on a Premium-gated tab (Coach or Explore).
// Plan is the free, always-available entry point of the Direction B journey.
export default function Index() {
  return <Redirect href="/(tabs)/plan" />;
}
