import { Redirect } from "expo-router";

// Deep-link landing route (apexai://auth#session_token=... / #session_id=...).
// Token processing happens in AuthContext's URL listener; this just re-routes.
export default function AuthRedirect() {
  return <Redirect href="/" />;
}
