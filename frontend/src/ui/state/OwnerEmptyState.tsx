// State System component 14: owner-namespace empty state.
// Must never reveal another profile's data or even its existence, and must
// never print an owner identifier.

import React from "react";
import { Ionicons } from "@expo/vector-icons";

import { EmptyState } from "./EmptyState";

export type OwnerEmptyStateProps = {
  /** What is empty, e.g. "No workouts on this profile yet". */
  title: string;
  /** What the person can do next — never who else has data. */
  body: string;
  icon?: keyof typeof Ionicons.glyphMap;
  primary?: { label: string; onPress: () => void; testID?: string };
  secondary?: { label: string; onPress: () => void; testID?: string };
  testID?: string;
};

const PRIVACY_NOTE = "Your training data stays on this device and is kept separate for each profile.";

export function OwnerEmptyState({
  title,
  body,
  icon = "person-circle-outline",
  primary,
  secondary,
  testID,
}: OwnerEmptyStateProps) {
  return (
    <EmptyState
      icon={icon}
      title={title}
      body={body}
      note={PRIVACY_NOTE}
      primary={primary}
      secondary={secondary}
      testID={testID}
    />
  );
}
