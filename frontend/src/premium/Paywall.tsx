// Phase 4 — the corrected paywall.
//
// It advertises ONLY the four frozen Premium areas, takes every price, period and
// trial word from store data, makes its recommendation explicit, and never claims success before
// the designated entitlement has been verified. All non-happy paths use the shared
// State System.

import React, { useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";

import { useSemanticTokens } from "@/src/theme/semantic";
import {
  ActionButton,
  ErrorBanner,
  InfoBanner,
  LayoutSkeleton,
  RetryPanel,
  StatusAnnouncement,
} from "@/src/ui/state";
import { GlassSurface } from "@/src/ui/GlassSurface";
import { ScalePressable } from "@/src/ui/ScalePressable";

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

  const [selected, setSelected] = useState<string | null>(null);
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
  const chosenTerms = chosen
    ? productTerms(chosen.product, trialEligibility[chosen.identifier] ?? "unknown")
    : null;
  const renewalSummary = chosenTerms
    ? chosenTerms.trial
      ? `${chosenTerms.trial} ${chosenTerms.price}${chosenTerms.period ? ` every ${chosenTerms.period}` : ""}. Cancel anytime.`
      : `${chosenTerms.price}${chosenTerms.period ? ` every ${chosenTerms.period}` : ""}. Cancel anytime.`
    : PAYWALL_COPY.selectPrompt;

  // Remove a needless first tap while keeping the selection fully visible and
  // changeable. Annual is the recommendation when the store offers it; otherwise
  // the first store package is used. No price, saving or trial is invented here.
  useEffect(() => {
    if (selected || offeringState !== "ready" || sorted.length === 0) return;
    const recommended = sorted.find((p) => p.packageType === "ANNUAL") ?? sorted[0];
    setSelected(recommended.identifier);
  }, [offeringState, selected, sorted]);

  const onContinue = async () => {
    if (!chosen) return;
    setPurchaseOutcome(null);
    setRestoreOutcome(null);
    const outcome = await purchase(chosen);
    // A cancellation is a no-op: no error, no state change.
    setPurchaseOutcome(outcome === "cancelled" ? null : outcome);
  };

  // The free promise is one tap away rather than always open: it is the answer
  // to a question, and a reader who has not asked it does not need the wall of
  // text between them and the price.
  const [freeOpen, setFreeOpen] = useState(false);

  const onRestore = async () => {
    setPurchaseOutcome(null);
    setRestoreOutcome(null);
    setRestoreOutcome(await restorePurchases());
  };

  return (
    <View style={styles.root}>
      <LinearGradient
        colors={t.mode === "day"
          ? ["rgba(40,120,232,0.15)", "rgba(40,120,232,0.035)", "transparent"]
          : ["rgba(76,156,255,0.23)", "rgba(76,156,255,0.045)", "transparent"]}
        locations={[0, 0.38, 1]}
        style={styles.ambient}
        pointerEvents="none"
      />
      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingTop: insets.top + t.space.lg + headerOffset }]}
        showsVerticalScrollIndicator={false}
        testID="paywall"
      >
        <View style={styles.hero}>
          <Ionicons name="diamond" size={26} color={t.color.accent} />
          <View style={styles.eyebrowPill}>
            <Text style={styles.eyebrowText}>{PAYWALL_COPY.eyebrow.toUpperCase()}</Text>
          </View>
          <Text style={[t.type.title, styles.title]}>{title}</Text>
          <Text style={[t.type.body, styles.subtitle]}>{body}</Text>
        </View>

        {/* The lead benefit, shown rather than claimed. The bars are a worked
            example of a primary/secondary split — deliberately unlabelled with
            numbers, so nothing here is a figure the app must keep true. */}
        <View style={styles.leadCard} testID="paywall-outcomes">
          <View style={styles.leadHead}>
            <View style={styles.leadIcon}>
              <Ionicons name="stats-chart" size={20} color={t.color.accent} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.leadEyebrow}>{PAYWALL_COPY.lead.eyebrow.toUpperCase()}</Text>
              <Text style={[t.type.subheading, { color: t.color.text, marginTop: 2 }]}>
                {PAYWALL_COPY.lead.headline}
              </Text>
            </View>
          </View>

          <View style={styles.demo}>
            <Text style={styles.demoLabel}>
              {PAYWALL_COPY.lead.primaryLabel} · <Text style={styles.demoMuscle}>Chest</Text>
            </Text>
            <View style={styles.demoTrack}>
              <View style={[styles.demoFill, { width: "88%" }]} />
            </View>
            <Text style={[styles.demoLabel, { marginTop: 8 }]}>
              {PAYWALL_COPY.lead.secondaryLabel} · <Text style={styles.demoMuscle}>Triceps · Shoulders</Text>
            </Text>
            <View style={styles.demoSplit}>
              <View style={styles.demoTrackHalf}>
                <View style={[styles.demoFill, { width: "48%" }]} />
              </View>
              <View style={styles.demoTrackHalf}>
                <View style={[styles.demoFill, { width: "34%" }]} />
              </View>
            </View>
          </View>

        </View>

        {/* The two supporting areas. */}
        {PAYWALL_COPY.supporting.map((f) => (
          <View key={f.label} style={styles.featureRow}>
            <View style={styles.leadIcon}>
              <Ionicons name={f.icon as any} size={20} color={t.color.accent} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[t.type.bodyStrong, { color: t.color.text, fontSize: 15 }]}>{f.label}</Text>
              <Text style={[t.type.caption, { color: t.color.textFaint, marginTop: 2 }]} numberOfLines={1}>
                {f.desc}
              </Text>
            </View>
          </View>
        ))}

        <View style={styles.trustRow}>
          <Ionicons name="shield-checkmark" size={14} color={t.status.success.fg} />
          <Text style={[t.type.caption, { color: t.color.textSecondary }]}>App Store billing · Cancel anytime</Text>
        </View>

        {/* Put the decision close to the promise. The benefits remain visible
            below it for people who want detail before purchasing. */}
        {offeringState === "ready" && (
          <View style={styles.options} testID="paywall-options">
            <View style={styles.sectionHeading}>
              <Text style={[t.type.subheading, { color: t.color.text }]}>Choose your plan</Text>
              <Text style={[t.type.caption, { color: t.color.textMuted }]}>Billed by Apple</Text>
            </View>
            {sorted.map((p) => {
              const active = p.identifier === selected;
              const recommended = p.packageType === "ANNUAL";
              const terms = productTerms(p.product, trialEligibility[p.identifier] ?? "unknown");
              return (
                <ScalePressable
                  key={p.identifier}
                  style={{ width: "100%" }}
                  onPress={() => setSelected(p.identifier)}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: active }}
                  accessibilityLabel={[p.label, terms.price, terms.period && `every ${terms.period}`, terms.trial]
                    .filter(Boolean)
                    .join(", ")}
                  testID={`paywall-option-${p.packageType.toLowerCase()}`}
                >
                  <GlassSurface style={[styles.option, active && styles.optionActive]} intensity={active ? 48 : 26}>
                    <View style={[styles.radio, active && styles.radioActive]}>
                      {active ? <Ionicons name="checkmark" size={14} color={t.color.onAccent} /> : null}
                    </View>
                    <View style={{ flex: 1 }}>
                      <View style={styles.optionTitleRow}>
                        <Text style={[t.type.bodyStrong, { color: t.color.text }]}>{p.label}</Text>
                        {recommended ? (
                          <View style={styles.recommended} testID="paywall-recommended">
                            <Text style={styles.recommendedText}>BEST VALUE</Text>
                          </View>
                        ) : null}
                        {active ? (
                          <Text style={styles.selectedText} testID="paywall-selected-text">Selected</Text>
                        ) : null}
                      </View>
                      {terms.trial ? (
                        <Text style={[t.type.caption, { color: t.status.success.fg }]} testID={`paywall-trial-${p.packageType.toLowerCase()}`}>
                          {terms.trial}
                        </Text>
                      ) : terms.period ? (
                        <Text style={[t.type.caption, { color: t.color.textFaint }]}>{`Renews every ${terms.period}`}</Text>
                      ) : null}
                    </View>
                    <View style={{ alignItems: "flex-end" }}>
                      <Text style={[t.type.bodyStrong, { color: t.color.text }]}>{terms.price}</Text>
                      {terms.perPeriod ? (
                        <Text style={[t.type.caption, { color: t.color.accentSoft }]}>{terms.perPeriod}</Text>
                      ) : null}
                    </View>
                  </GlassSurface>
                </ScalePressable>
              );
            })}

            {/* The CTA belongs to the plan card, not to a floating dock: the
                dock covered the Monthly and Yearly rows, so the offer could not
                be read without scrolling past the button that accepts it. */}
            <ActionButton
              label={chosen
                ? chosenTerms?.trial ? PAYWALL_COPY.ctaTrial : PAYWALL_COPY.cta(chosen.label)
                : PAYWALL_COPY.ctaUnselected}
              onPress={onContinue}
              disabled={!chosen}
              busy={busy === "purchase"}
              busyLabel="Completing your purchase"
              style={{ width: "100%", marginTop: t.space.sm }}
              testID="paywall-continue"
            />
            <Text style={[t.type.caption, styles.renewalNote]}>{renewalSummary}</Text>
          </View>
        )}

        {/* One disclosure, opened on demand: the value list, the free promise
            and the billing terms. Collapsed by default so the whole offer fits
            on one screen without scrolling. */}
        <Pressable
          onPress={() => setFreeOpen((v) => !v)}
          accessibilityRole="button"
          accessibilityState={{ expanded: freeOpen }}
          accessibilityLabel={PAYWALL_COPY.upgradeToggle}
          style={styles.upgradeToggle}
          testID="paywall-upgrade-toggle"
        >
          <Text style={[t.type.bodyStrong, { color: t.color.text, flex: 1 }]}>{PAYWALL_COPY.upgradeToggle}</Text>
          <Ionicons name={freeOpen ? "chevron-up" : "chevron-down"} size={17} color={t.color.textMuted} />
        </Pressable>

        {freeOpen && (
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
            <InfoBanner message={PAYWALL_COPY.freeReassurance} testID="paywall-free-note" />
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
          </View>
        )}

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
          label={PAYWALL_COPY.legal.restore}
          variant="secondary"
          onPress={onRestore}
          busy={busy === "restore"}
          busyLabel={PAYWALL_COPY.restoreBusy}
          style={{ width: "100%" }}
          testID="paywall-restore"
        />


        <View style={styles.legalRow}>
          <Pressable onPress={() => router.push("/terms")} style={styles.legalBtn} accessibilityRole="button" testID="paywall-terms">
            <Text style={[t.type.caption, styles.legalLink]}>{PAYWALL_COPY.legal.terms}</Text>
          </Pressable>
          <Text style={[t.type.caption, { color: t.color.textFaint }]}>·</Text>
          <Pressable onPress={() => router.push("/privacy")} style={styles.legalBtn} accessibilityRole="button" testID="paywall-privacy">
            <Text style={[t.type.caption, styles.legalLink]}>{PAYWALL_COPY.legal.privacy}</Text>
          </Pressable>
        </View>
      </ScrollView>
    </View>
  );
}

const makeStyles = (t: ReturnType<typeof useSemanticTokens>) =>
  StyleSheet.create({
    root: { flex: 1, backgroundColor: t.color.bg },
    ambient: { position: "absolute", top: 0, left: 0, right: 0, height: 420 },
    scroll: { paddingHorizontal: t.space.lg, paddingBottom: 20, alignItems: "center", gap: 8 },
    hero: { alignItems: "center", width: "100%", gap: 4 },
    eyebrowPill: {
      backgroundColor: t.color.accent, borderRadius: t.radius.pill,
      paddingHorizontal: 16, paddingVertical: 5, marginTop: 0,
    },
    eyebrowText: { color: t.color.onAccent, fontSize: 12.5, fontWeight: "800", letterSpacing: 0.9 },

    leadCard: {
      width: "100%", backgroundColor: t.color.surface, borderRadius: t.radius.xl,
      borderWidth: 1, borderColor: t.color.border, padding: 12, gap: 10,
    },
    leadHead: { flexDirection: "row", alignItems: "flex-start", gap: t.space.md },
    leadIcon: {
      width: 34, height: 34, borderRadius: 11, alignItems: "center", justifyContent: "center",
      backgroundColor: t.color.surfaceAlt,
    },
    leadEyebrow: { color: t.color.accent, fontSize: 11.5, fontWeight: "800", letterSpacing: 0.8 },
    demo: { gap: 2 },
    demoLabel: { color: t.color.textSecondary, fontSize: 12.5, fontWeight: "600" },
    demoMuscle: { color: t.color.text },
    demoTrack: { height: 7, borderRadius: 5, backgroundColor: t.color.surfaceAlt, overflow: "hidden", marginTop: 6 },
    demoTrackHalf: { flex: 1, height: 7, borderRadius: 5, backgroundColor: t.color.surfaceAlt, overflow: "hidden" },
    demoSplit: { flexDirection: "row", gap: 10, marginTop: 6 },
    demoFill: { height: 7, borderRadius: 5, backgroundColor: t.color.accent },
    leadCta: { flexDirection: "row", alignItems: "center", gap: 8, minHeight: 44 },
    leadCtaText: { color: t.color.accent, fontSize: 15, fontWeight: "700" },

    featureRow: {
      width: "100%", flexDirection: "row", alignItems: "center", gap: t.space.md,
      backgroundColor: t.color.surface, borderRadius: t.radius.xl,
      borderWidth: 1, borderColor: t.color.border, paddingHorizontal: t.space.md,
      height: 58,
    },
    upgradeToggle: {
      width: "100%", flexDirection: "row", alignItems: "center", gap: t.space.sm,
      minHeight: 46, paddingHorizontal: t.space.lg, borderRadius: t.radius.xl,
      backgroundColor: t.color.surface, borderWidth: 1, borderColor: t.color.border,
    },
    badge: {
      width: 58,
      height: 58,
      borderRadius: 22,
      alignItems: "center",
      justifyContent: "center",
    },
    title: { color: t.color.text, textAlign: "center", fontSize: 24, lineHeight: 28 },
    subtitle: { color: t.color.textSecondary, textAlign: "center", maxWidth: 360, fontSize: 13 },
    trustRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 2 },
    outcomeGrid: { width: "100%", flexDirection: "row", gap: t.space.sm, marginTop: t.space.sm },
    outcomeCell: {
      flex: 1,
      minHeight: 76,
      alignItems: "center",
      justifyContent: "center",
      gap: 6,
      paddingHorizontal: 6,
      paddingVertical: 10,
      backgroundColor: t.color.surface,
      
      
      borderRadius: t.radius.lg,
    },
    outcomeText: { color: t.color.text, fontSize: 10.5, lineHeight: 14, fontWeight: "700", textAlign: "center" },
    values: { width: "100%", gap: t.space.sm },
    valueRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: t.space.md,
      backgroundColor: t.color.surface,
      
      
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
    options: { width: "100%", gap: 7 },
    sectionHeading: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 2 },
    option: {
      flexDirection: "row",
      alignItems: "center",
      gap: t.space.md,
      borderRadius: t.radius.xl,
      paddingHorizontal: t.space.md,
      paddingVertical: 11,
      minHeight: t.target.comfortable,
      borderWidth: 1.5,
      borderColor: "transparent",
    },
    // Selected is an accent outline; the fill stays exactly as it was.
    optionActive: { borderColor: t.color.accent },
    radio: { width: 22, height: 22, borderRadius: 22, borderWidth: 1.5, borderColor: t.color.textFaint, alignItems: "center", justifyContent: "center" },
    radioActive: { backgroundColor: t.color.accent, borderColor: t.color.accent },
    optionTitleRow: { flexDirection: "row", alignItems: "center", gap: 7 },
    recommended: { backgroundColor: t.mode === "day" ? "rgba(40,120,232,0.11)" : "rgba(76,156,255,0.16)", borderRadius: t.radius.pill, paddingHorizontal: 7, paddingVertical: 3 },
    recommendedText: { color: t.color.accentSoft, fontSize: 9, lineHeight: 11, fontWeight: "800", letterSpacing: 0.6 },
    selectedText: { color: t.color.accentSoft, fontSize: 10, lineHeight: 13, fontWeight: "700" },
    disclosure: {
      width: "100%",
      backgroundColor: t.color.surface,
      
      
      borderRadius: t.radius.md,
      padding: t.space.md,
    },
    legalRow: { flexDirection: "row", alignItems: "center", gap: t.space.sm },
    legalBtn: { minHeight: t.target.min, justifyContent: "center", paddingHorizontal: 4 },
    legalLink: { color: t.color.textSecondary, fontWeight: "700" },
    bottomDock: {
      position: "absolute",
      left: t.space.md,
      right: t.space.md,
      bottom: 0,
      borderTopLeftRadius: t.radius.xxl,
      borderTopRightRadius: t.radius.xxl,
      paddingHorizontal: t.space.md,
      paddingTop: t.space.md,
      gap: 3,
    },
    renewalNote: { color: t.color.textMuted, textAlign: "center" },
  });
