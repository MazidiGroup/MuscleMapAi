// Phase 4 — the corrected paywall.
//
// It advertises ONLY the four frozen Premium areas, takes every price, period and
// trial word from store data, preselects nothing, and never claims success before
// the designated entitlement has been verified. All non-happy paths use the shared
// State System.

import React, { useMemo, useState } from "react";
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";

import { useSemanticTokens } from "@/src/theme/semantic";
import {
  ActionButton,
  ErrorBanner,
  InfoBanner,
  LayoutSkeleton,
  RetryPanel,
  StatusAnnouncement,
} from "@/src/ui/state";

import { PremiumPackage, usePremium } from "./PremiumContext";
import {
  PAYWALL_COPY,
  PREMIUM_VALUE_ITEMS,
  PurchaseOutcome,
  RestoreOutcome,
  productTerms,
} from "./entitlement";

/** Preferred display order; anything unknown sorts last, nothing is invented. */
const ORDER = ["WEEKLY", "MONTHLY", "ANNUAL", "LIFETIME"];

export function Paywall({
  title = PAYWALL_COPY.title,
  body = PAYWALL_COPY.subtitle,
  headerOffset = 0,
}: {
  title?: string;
  body?: string;
  headerOffset?: number;
}) {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const t = useSemanticTokens();
  const styles = useMemo(() => makeStyles(t), [t]);
  const { packages, offeringState, trialEligibility, busy, purchase, restorePurchases, refreshOfferings } = usePremium();

  const [selected, setSelected] = useState<string | null>(null); // nothing preselected
  const [purchaseOutcome, setPurchaseOutcome] = useState<PurchaseOutcome | null>(null);
  const [restoreOutcome, setRestoreOutcome] = useState<RestoreOutcome | null>(null);

  const sorted = useMemo(
    () =>
      [...packages].sort((a, b) => {
        const ia = ORDER.indexOf(a.packageType);
        const ib = ORDER.indexOf(b.packageType);
        return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
      }),
    [packages],
  );

  const chosen: PremiumPackage | undefined = sorted.find((p) => p.identifier === selected);

  const onContinue = async () => {
    if (!chosen) return;
    setPurchaseOutcome(null);
    setRestoreOutcome(null);
    const outcome = await purchase(chosen);
    // A cancellation is a no-op: no error, no state change.
    setPurchaseOutcome(outcome === "cancelled" ? null : outcome);
  };

  const onRestore = async () => {
    setPurchaseOutcome(null);
    setRestoreOutcome(null);
    setRestoreOutcome(await restorePurchases());
  };

  return (
    <View style={[styles.root, { paddingTop: insets.top + t.space.lg + headerOffset }]}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false} testID="paywall">
        <View style={styles.badge}>
          <Ionicons name="star" size={26} color={t.color.accent} />
        </View>
        <Text style={[t.type.title, { color: t.color.text, textAlign: "center" }]}>{title}</Text>
        <Text style={[t.type.body, styles.subtitle]}>{body}</Text>

        {/* Only the four frozen Premium areas may appear here. */}
        <View style={styles.values} testID="paywall-values">
          {PREMIUM_VALUE_ITEMS.map((v) => (
            <View key={v.label} style={styles.valueRow}>
              <View style={styles.valueIcon}>
                <Ionicons name={v.icon as any} size={18} color={t.color.accent} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[t.type.bodyStrong, { color: t.color.text }]}>{v.label}</Text>
                <Text style={[t.type.caption, { color: t.color.textFaint }]}>{v.desc}</Text>
              </View>
            </View>
          ))}
        </View>

        <InfoBanner message={PAYWALL_COPY.freeReassurance} testID="paywall-free-note" />

        {/* --- store options ------------------------------------------------ */}
        {offeringState === "loading" && (
          <>
            <StatusAnnouncement message={PAYWALL_COPY.loadingProducts} visible={false} />
            <LayoutSkeleton rows={2} style={{ width: "100%", marginTop: t.space.md }} />
          </>
        )}

        {(offeringState === "error" || offeringState === "empty") && (
          <RetryPanel
            title={PAYWALL_COPY.noOffering.title}
            body={PAYWALL_COPY.noOffering.body}
            preserved={["Your Plan", "Your workouts and History", "The full exercise library"]}
            retry={{ label: "Try again", onPress: refreshOfferings, testID: "paywall-offering-retry" }}
            testID="paywall-no-offering"
          />
        )}

        {offeringState === "ready" && (
          <View style={styles.options} testID="paywall-options">
            <Text style={[t.type.label, { color: t.color.textMuted }]}>{PAYWALL_COPY.selectPrompt}</Text>
            {sorted.map((p) => {
              const active = p.identifier === selected;
              const terms = productTerms(p.product, trialEligibility[p.identifier] ?? "unknown");
              return (
                <TouchableOpacity
                  key={p.identifier}
                  style={[styles.option, active && styles.optionActive]}
                  onPress={() => setSelected(p.identifier)}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: active }}
                  accessibilityLabel={[p.label, terms.price, terms.period && `every ${terms.period}`, terms.trial]
                    .filter(Boolean)
                    .join(", ")}
                  testID={`paywall-option-${p.packageType.toLowerCase()}`}
                >
                  <Ionicons
                    name={active ? "checkmark-circle" : "ellipse-outline"}
                    size={22}
                    color={active ? t.color.accent : t.color.border}
                  />
                  <View style={{ flex: 1 }}>
                    <Text style={[t.type.bodyStrong, { color: t.color.text }]}>{p.label}</Text>
                    {terms.period ? (
                      <Text style={[t.type.caption, { color: t.color.textFaint }]}>{`Renews every ${terms.period}`}</Text>
                    ) : null}
                    {terms.trial ? (
                      <Text style={[t.type.caption, { color: t.color.accent }]} testID={`paywall-trial-${p.packageType.toLowerCase()}`}>
                        {terms.trial}
                      </Text>
                    ) : null}
                    {active ? (
                      <Text style={[t.type.caption, { color: t.color.accent }]} testID="paywall-selected-text">
                        Selected
                      </Text>
                    ) : null}
                  </View>
                  <View style={{ alignItems: "flex-end" }}>
                    <Text style={[t.type.bodyStrong, { color: t.color.text }]}>{terms.price}</Text>
                    {terms.perPeriod ? (
                      <Text style={[t.type.caption, { color: t.color.textFaint }]}>{terms.perPeriod}</Text>
                    ) : null}
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
        )}

        {/* --- outcomes ----------------------------------------------------- */}
        {purchaseOutcome === "verified" && (
          <InfoBanner message={PAYWALL_COPY.purchaseVerified} testID="paywall-purchase-verified" />
        )}
        {purchaseOutcome === "failed" && (
          <ErrorBanner
            title={PAYWALL_COPY.purchaseFailed.title}
            message={PAYWALL_COPY.purchaseFailed.body}
            testID="paywall-purchase-failed"
          />
        )}
        {purchaseOutcome === "unknown" && (
          <ErrorBanner
            title={PAYWALL_COPY.purchaseUnknown.title}
            message={PAYWALL_COPY.purchaseUnknown.body}
            testID="paywall-purchase-unknown"
          />
        )}
        {purchaseOutcome === "refresh_failed" && (
          <ErrorBanner
            title={PAYWALL_COPY.refreshFailed.title}
            message={PAYWALL_COPY.refreshFailed.body}
            testID="paywall-refresh-failed"
          />
        )}
        {purchaseOutcome === "unavailable" && (
          <InfoBanner message={PAYWALL_COPY.noOffering.body} testID="paywall-purchase-unavailable" />
        )}

        {restoreOutcome === "verified" && (
          <InfoBanner message={PAYWALL_COPY.restoreVerified} testID="paywall-restore-verified" />
        )}
        {restoreOutcome === "nothing_to_restore" && (
          <InfoBanner message={PAYWALL_COPY.restoreNothing} testID="paywall-restore-nothing" />
        )}
        {restoreOutcome === "failed" && (
          <ErrorBanner
            title={PAYWALL_COPY.restoreFailed.title}
            message={PAYWALL_COPY.restoreFailed.body}
            testID="paywall-restore-failed"
          />
        )}

        <ActionButton
          label={chosen ? PAYWALL_COPY.cta(chosen.label) : PAYWALL_COPY.ctaUnselected}
          onPress={onContinue}
          disabled={!chosen}
          busy={busy === "purchase"}
          busyLabel="Completing your purchase"
          style={{ width: "100%", marginTop: t.space.md }}
          testID="paywall-continue"
        />

        <ActionButton
          label={PAYWALL_COPY.legal.restore}
          variant="secondary"
          onPress={onRestore}
          busy={busy === "restore"}
          busyLabel={PAYWALL_COPY.restoreBusy}
          style={{ width: "100%" }}
          testID="paywall-restore"
        />

        {/* Required subscription disclosure — no price, period or trial is hardcoded. */}
        <View style={styles.disclosure}>
          <Text style={[t.type.label, { color: t.color.textMuted }]}>Subscription details</Text>
          <Text style={[t.type.caption, { color: t.color.textFaint, marginTop: 6 }]}>
            Premium is an auto-renewing subscription. Payment is charged to your Apple ID at confirmation of
            purchase, and it renews for the same period at the price shown above unless auto-renew is turned off
            at least 24 hours before the end of the current period. You can manage or cancel it in your Apple ID
            Account Settings.
          </Text>
        </View>

        <View style={styles.legalRow}>
          <TouchableOpacity onPress={() => router.push("/terms")} style={styles.legalBtn} testID="paywall-terms">
            <Text style={[t.type.caption, styles.legalLink]}>{PAYWALL_COPY.legal.terms}</Text>
          </TouchableOpacity>
          <Text style={[t.type.caption, { color: t.color.textFaint }]}>·</Text>
          <TouchableOpacity onPress={() => router.push("/privacy")} style={styles.legalBtn} testID="paywall-privacy">
            <Text style={[t.type.caption, styles.legalLink]}>{PAYWALL_COPY.legal.privacy}</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </View>
  );
}

const makeStyles = (t: ReturnType<typeof useSemanticTokens>) =>
  StyleSheet.create({
    root: { flex: 1, backgroundColor: t.color.bg },
    scroll: { paddingHorizontal: t.space.lg, paddingBottom: 40, alignItems: "center", gap: t.space.md },
    badge: {
      width: 56,
      height: 56,
      borderRadius: t.radius.xl,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: t.color.accentSoft + "1A",
      borderWidth: 1,
      borderColor: t.color.border,
    },
    subtitle: { color: t.color.textSecondary, textAlign: "center", maxWidth: 320 },
    values: { width: "100%", gap: t.space.sm },
    valueRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: t.space.md,
      backgroundColor: t.color.surface,
      borderWidth: 1,
      borderColor: t.color.border,
      borderRadius: t.radius.lg,
      padding: t.space.md,
    },
    valueIcon: {
      width: 36,
      height: 36,
      borderRadius: t.radius.md,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: t.color.surfaceAlt,
    },
    options: { width: "100%", gap: t.space.sm },
    option: {
      flexDirection: "row",
      alignItems: "center",
      gap: t.space.md,
      backgroundColor: t.color.surface,
      borderWidth: 1,
      borderColor: t.color.border,
      borderRadius: t.radius.lg,
      paddingHorizontal: t.space.md,
      paddingVertical: t.space.md,
      minHeight: t.target.comfortable,
    },
    optionActive: { borderColor: t.color.accent, borderWidth: 2 },
    disclosure: {
      width: "100%",
      backgroundColor: t.color.surface,
      borderWidth: 1,
      borderColor: t.color.border,
      borderRadius: t.radius.md,
      padding: t.space.md,
    },
    legalRow: { flexDirection: "row", alignItems: "center", gap: t.space.sm },
    legalBtn: { minHeight: t.target.min, justifyContent: "center", paddingHorizontal: 4 },
    legalLink: { color: t.color.textSecondary, fontWeight: "700", textDecorationLine: "underline" },
  });
