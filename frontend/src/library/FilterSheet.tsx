// Library filters — Equipment · Muscle group · Movement pattern.
//
// Every option and every count comes from the catalogue itself. There are no
// popularity, rating, difficulty, suitability or goal filters, because the
// repository cannot support them honestly.

import React, { useMemo } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { useSemanticTokens } from "@/src/theme/semantic";
import { ActionButton, EmptyState, InfoBanner } from "@/src/ui/state";
import { LiquidSheen } from "@/src/ui/GlassSurface";

import {
  CatalogFilters,
  Facet,
  activeFilterCount,
  applyLabel,
  equipmentFacets,
  filterEmptyMessage,
  movementFacets,
  muscleFacets,
  queryCatalogue,
  toggleFilter,
} from "./catalogQuery";

export function FilterSheet({
  visible,
  filters,
  query,
  onChange,
  onClear,
  onClose,
}: {
  visible: boolean;
  filters: CatalogFilters;
  query: string;
  onChange: (next: CatalogFilters) => void;
  onClear: () => void;
  onClose: () => void;
}) {
  const t = useSemanticTokens();
  const equipment = useMemo(() => equipmentFacets(), []);
  const muscles = useMemo(() => muscleFacets(), []);
  const movements = useMemo(() => movementFacets(), []);
  const resultCount = useMemo(() => queryCatalogue(query, filters).length, [query, filters]);
  const active = activeFilterCount(filters);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable
        style={[styles.backdrop, { backgroundColor: t.color.scrim }]}
        onPress={onClose}
        accessibilityRole="button"
        accessibilityLabel="Close filters"
      />
      <View
        style={[styles.sheet, { backgroundColor: t.color.surface, borderColor: t.color.border, padding: t.space.xl }]}
        testID="library-filter-sheet"
      >
        <LiquidSheen tone="neutral" />
        <View style={styles.head}>
          <Text style={[t.type.heading, { color: t.color.text }]}>Filters</Text>
          <Text
            style={[t.type.label, { color: t.color.textMuted }]}
            accessibilityLiveRegion="polite"
            testID="filter-active-count"
          >
            {active === 0 ? "No filters applied" : `${active} filter${active === 1 ? "" : "s"} applied`}
          </Text>
        </View>

        <ScrollView style={{ maxHeight: 400 }} contentContainerStyle={{ gap: t.space.lg, paddingBottom: t.space.md }}>
          <Group title="Equipment" facets={equipment} selected={filters.equipment} onToggle={(v) => onChange(toggleFilter(filters, "equipment", v))} />
          <Group title="Muscle group" facets={muscles} selected={filters.muscle} onToggle={(v) => onChange(toggleFilter(filters, "muscle", v))} />
          <Group title="Movement pattern" facets={movements} selected={filters.movement} onToggle={(v) => onChange(toggleFilter(filters, "movement", v))} />
        </ScrollView>

        {resultCount === 0 ? (
          <View style={{ gap: t.space.md }} testID="filter-empty">
            <InfoBanner message={filterEmptyMessage(filters)} />
            <ActionButton label="Clear all filters" onPress={onClear} testID="filter-clear-empty" />
          </View>
        ) : (
          <>
            <ActionButton label={applyLabel(resultCount)} onPress={onClose} testID="filter-apply" />
            <ActionButton label="Clear all" variant="secondary" onPress={onClear} testID="filter-clear" />
          </>
        )}
      </View>
    </Modal>
  );
}

function Group({
  title,
  facets,
  selected,
  onToggle,
}: {
  title: string;
  facets: Facet[];
  selected?: string[];
  onToggle: (value: string) => void;
}) {
  const t = useSemanticTokens();
  if (facets.length === 0) return <EmptyState icon="funnel-outline" title={title} body="No options in the catalogue." />;
  return (
    <View style={{ gap: t.space.sm }}>
      <Text style={[t.type.label, { color: t.color.textMuted }]}>{title}</Text>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: t.space.sm }}>
        {facets.map((f) => {
          const on = !!selected?.includes(f.value);
          return (
            <Pressable
              key={f.value}
              onPress={() => onToggle(f.value)}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: on }}
              accessibilityLabel={`${f.value}, ${f.count} exercises${on ? ", selected" : ""}`}
              testID={`facet-${f.value}`}
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 6,
                minHeight: t.target.min,
                paddingHorizontal: t.space.lg,
                borderRadius: t.radius.pill,
                borderWidth: on ? 2 : 1,
                borderColor: on ? t.color.accent : t.color.border,
                backgroundColor: on ? t.color.accent + "22" : t.color.surfaceAlt,
                overflow: "hidden",
              }}
            >
              <LiquidSheen tone={on ? "accent" : "neutral"} />
              {on && <Text style={[t.type.label, { color: t.color.accent }]}>✓</Text>}
              <Text style={[t.type.label, { color: on ? t.color.accent : t.color.textSecondary }]}>{f.value}</Text>
              <Text style={[t.type.caption, { color: t.color.textMuted }]}>{f.count}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1 },
  sheet: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderWidth: 1,
    gap: 12,
    overflow: "hidden",
  },
  head: { flexDirection: "row", alignItems: "baseline", justifyContent: "space-between" },
});
