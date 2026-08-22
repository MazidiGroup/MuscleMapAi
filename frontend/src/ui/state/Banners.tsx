// State System components 01–04: inline information, offline, warning and error
// banners. Severity is carried by icon + title + shape + colour, never colour
// alone. Error is assertive and announced once; the rest are polite status.

import React from "react";
import { StyleProp, Text, View, ViewStyle } from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { StatusRole, useSemanticTokens } from "@/src/theme/semantic";
import { LiquidSheen } from "@/src/ui/GlassSurface";

type BannerProps = {
  /** Short title carrying severity in words as well as colour. */
  title?: string;
  /** Body copy: what happened / what still works / what to do next. */
  message: string;
  style?: StyleProp<ViewStyle>;
  testID?: string;
};

const ICONS: Record<StatusRole | "offline", keyof typeof Ionicons.glyphMap> = {
  info: "information-circle",
  success: "checkmark-circle",
  warning: "alert-circle-outline",
  error: "alert-circle",
  offline: "cloud-offline-outline",
};

function Banner({
  role,
  icon,
  assertive,
  title,
  message,
  style,
  testID,
}: BannerProps & { role: StatusRole; icon: keyof typeof Ionicons.glyphMap; assertive?: boolean }) {
  const t = useSemanticTokens();
  const c = t.status[role];
  return (
    <View
      testID={testID}
      accessible
      accessibilityRole={assertive ? "alert" : "text"}
      accessibilityLiveRegion={assertive ? "assertive" : "polite"}
      accessibilityLabel={title ? `${title}. ${message}` : message}
      style={[
        {
          flexDirection: "row",
          gap: t.space.sm + 1,
          padding: t.space.md,
          borderRadius: t.radius.md,
          backgroundColor: c.bg,
          borderWidth: 1,
          borderColor: c.border,
          alignItems: "flex-start",
          overflow: "hidden",
        },
        style,
      ]}
    >
      <LiquidSheen tone={role === "error" ? "danger" : "subtle"} />
      <Ionicons name={icon} size={16} color={c.fg} style={{ marginTop: 1 }} />
      <View style={{ flex: 1 }}>
        {title ? (
          <Text style={{ ...t.type.label, color: c.fg, marginBottom: 2 }}>{title}</Text>
        ) : null}
        <Text style={{ ...t.type.caption, fontWeight: "600", color: c.text }}>{message}</Text>
      </View>
    </View>
  );
}

/** 01 — neutral, non-blocking information. */
export function InfoBanner(props: BannerProps) {
  return <Banner role="info" icon={ICONS.info} {...props} />;
}

/**
 * 02 — offline. Copy must name what still works before what needs a connection;
 * the caller supplies `stillWorks` first for exactly that reason.
 */
export function OfflineBanner({
  stillWorks,
  needsConnection,
  title = "You're offline",
  ...rest
}: Omit<BannerProps, "message"> & { stillWorks: string; needsConnection: string }) {
  return (
    <Banner
      role="warning"
      icon={ICONS.offline}
      title={title}
      message={`${stillWorks} ${needsConnection}`}
      {...rest}
    />
  );
}

/** 03 — non-destructive warning with an explicit consequence. */
export function WarningBanner(props: BannerProps & { consequence: string }) {
  const { consequence, message, ...rest } = props;
  return <Banner role="warning" icon={ICONS.warning} message={`${message} ${consequence}`} {...rest} />;
}

/** 04 — recoverable error. Assertive, announced once, entered data retained. */
export function ErrorBanner(props: BannerProps) {
  return <Banner role="error" icon={ICONS.error} assertive {...props} />;
}
