import React, { useMemo } from "react";
import { View, Text, StyleSheet, ScrollView, Linking } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";

import { legacyPalette, LegacyPalette } from "@/src/anatomy/ui";
import { LiquidTouchableOpacity as TouchableOpacity } from "@/src/ui/LiquidTouchableOpacity";
import { LiquidSheen } from "@/src/ui/GlassSurface";
import { useTheme } from "@/src/theme/ThemeContext";

type Ref = { title: string; publisher: string; url: string };
type Category = { title: string; blurb: string; refs: Ref[] };

const CATEGORIES: Category[] = [
  {
    title: "Musculoskeletal Anatomy",
    blurb:
      "Muscle names, origins, insertions and functions in the app's 3D viewer, Library and Lessons are drawn from the following authoritative anatomical references.",
    refs: [
      { title: "Gray's Anatomy for Students (Elsevier)", publisher: "Elsevier", url: "https://www.elsevier.com/books/grays-anatomy-for-students/drake/978-0-323-93424-3" },
      { title: "Kenhub — Muscular System (peer-reviewed anatomy)", publisher: "Kenhub", url: "https://www.kenhub.com/en/library/anatomy/muscular-system" },
      { title: "TeachMeAnatomy — Muscles", publisher: "TeachMeAnatomy", url: "https://teachmeanatomy.info/the-basics/muscles/" },
      { title: "Anatomy, Skeletal Muscle — StatPearls (NIH Bookshelf)", publisher: "NIH", url: "https://www.ncbi.nlm.nih.gov/books/NBK537236/" },
    ],
  },
  {
    title: "Muscle Recovery Timing (24–72 h estimates)",
    blurb:
      "The recovery heatmap, muscle recovery timers and per-group recovery estimates shown in Insights and the Library are based on published evidence about delayed-onset muscle soreness (DOMS) and the time-course of protein synthesis after resistance training.",
    refs: [
      { title: "Damas F. et al. — Time-course of muscle protein synthesis (2015)", publisher: "PubMed", url: "https://pubmed.ncbi.nlm.nih.gov/26178489/" },
      { title: "Cheung K. et al. — Delayed onset muscle soreness: treatment strategies and performance factors", publisher: "PubMed", url: "https://pubmed.ncbi.nlm.nih.gov/12617692/" },
      { title: "ACSM Position Stand — Progression models in resistance training", publisher: "American College of Sports Medicine (ACSM)", url: "https://journals.lww.com/acsm-msse/Fulltext/2009/03000/Progression_Models_in_Resistance_Training_for.26.aspx" },
      { title: "Delayed-onset muscle soreness (DOMS) — MedlinePlus", publisher: "NIH · MedlinePlus", url: "https://medlineplus.gov/ency/patientinstructions/000803.htm" },
    ],
  },
  {
    title: "Training Principles, Rep Ranges & Progressive Overload",
    blurb:
      "AI Coach recommendations and Workout suggestions (sets, reps, load progression, split templates) reference the consensus of the following professional bodies and peer-reviewed reviews.",
    refs: [
      { title: "ACSM — Physical Activity Guidelines & Resistance Training Guidelines", publisher: "ACSM", url: "https://www.acsm.org/education-resources/trending-topics-resources/physical-activity-guidelines" },
      { title: "NSCA — Essentials of Strength Training and Conditioning (4th Ed.)", publisher: "National Strength & Conditioning Association", url: "https://www.nsca.com/store/product-detail/INV/9781718210868/9781718210868" },
      { title: "NASM — Optimum Performance Training Model", publisher: "National Academy of Sports Medicine", url: "https://www.nasm.org/certified-personal-trainer/opt-model" },
      { title: "Schoenfeld B. et al. — Dose-response relationship between weekly resistance-training volume and increases in muscle mass", publisher: "PubMed", url: "https://pubmed.ncbi.nlm.nih.gov/28933024/" },
      { title: "WHO Guidelines on Physical Activity and Sedentary Behaviour", publisher: "World Health Organization", url: "https://www.who.int/publications/i/item/9789240015128" },
    ],
  },
  {
    title: "Exercise Technique & Injury Prevention",
    blurb:
      "Exercise cues, prime-mover attributions and pain / injury guidance in the Coach and Muscle detail sheets are aligned with the following resources. If you experience pain or a suspected injury, consult a licensed medical professional.",
    refs: [
      { title: "Mayo Clinic — Strength training: Get stronger, leaner, healthier", publisher: "Mayo Clinic", url: "https://www.mayoclinic.org/healthy-lifestyle/fitness/in-depth/strength-training/art-20046670" },
      { title: "Cleveland Clinic — Exercise & Fitness (health library)", publisher: "Cleveland Clinic", url: "https://my.clevelandclinic.org/health/articles/24696-exercise" },
      { title: "NHS — Exercise: fitness benefits and guidance", publisher: "UK National Health Service", url: "https://www.nhs.uk/live-well/exercise/" },
      { title: "American Academy of Orthopaedic Surgeons — OrthoInfo", publisher: "AAOS", url: "https://orthoinfo.aaos.org/" },
    ],
  },
  {
    title: "AI Coach — Model & Content Policy",
    blurb:
      "The AI Coach uses a large-language model (Anthropic Claude) that is prompted to include a Sources block citing the references above (or equivalent authoritative sources) for any health, medical or physiological claim. Answers are educational only and are not a substitute for professional medical advice.",
    refs: [
      { title: "Anthropic — Claude usage policies", publisher: "Anthropic", url: "https://www.anthropic.com/legal/aup" },
      { title: "FDA — Consumer health information", publisher: "U.S. Food and Drug Administration", url: "https://www.fda.gov/consumers" },
    ],
  },
];

export default function ReferencesScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { mode } = useTheme();
  const T = useMemo(() => legacyPalette(mode), [mode]);
  const styles = useMemo(() => makeStyles(T), [T]);

  return (
    <View style={styles.root}>
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <TouchableOpacity style={styles.back} onPress={() => router.back()} testID="refs-back">
          <Ionicons name="chevron-back" size={24} color={T.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Sources & References</Text>
        <View style={styles.backPlaceholder} />
      </View>

      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: insets.bottom + 40 }} showsVerticalScrollIndicator={false}>
        <View style={styles.notice}>
          <LiquidSheen tone="subtle" />
          <Ionicons name="information-circle-outline" size={16} color={T.accent} />
          <Text style={styles.noticeText}>
            Muscle Map Ai is an educational anatomy and fitness reference. The information below is
            provided for education only and is not medical advice. Always consult a qualified
            healthcare professional for medical concerns, injuries, or before starting a new
            training programme.
          </Text>
        </View>

        {CATEGORIES.map((cat) => (
          <View key={cat.title} style={styles.category}>
            <Text style={styles.h2}>{cat.title}</Text>
            <Text style={styles.blurb}>{cat.blurb}</Text>
            {cat.refs.map((r) => (
              <TouchableOpacity
                key={r.url}
                style={styles.refRow}
                onPress={() => Linking.openURL(r.url).catch(() => {})}
                testID={`ref-${r.url}`}
              >
                <View style={{ flex: 1 }}>
                  <Text style={styles.refTitle}>{r.title}</Text>
                  <Text style={styles.refPub}>{r.publisher}</Text>
                </View>
                <Ionicons name="open-outline" size={18} color={T.accent} />
              </TouchableOpacity>
            ))}
          </View>
        ))}

        <Text style={styles.footer}>
          Last updated: July 2026. Have a suggestion or spotted a citation gap?
          {" "}
          <Text style={styles.link} onPress={() => Linking.openURL("mailto:info@mazidigroup.com?subject=Muscle%20Map%20Ai%20-%20References")}>
            Email us
          </Text>.
        </Text>
      </ScrollView>
    </View>
  );
}

const makeStyles = (T: LegacyPalette) => StyleSheet.create({
  root: { flex: 1, backgroundColor: T.bg },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 12,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: T.border,
  },
  back: { width: 40, height: 40, borderRadius: 20, borderWidth: 1, borderColor: T.border, backgroundColor: T.surface, alignItems: "center", justifyContent: "center" },
  backPlaceholder: { width: 40, height: 40 },
  headerTitle: { color: T.text, fontSize: 17, fontWeight: "800" },
  notice: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    backgroundColor: T.surface,
    borderWidth: 1,
    borderColor: T.border,
    borderRadius: 12,
    padding: 14,
    marginBottom: 20,
    overflow: "hidden",
  },
  noticeText: { flex: 1, color: T.textDim, fontSize: 13, lineHeight: 19 },
  category: { marginBottom: 24 },
  h2: { color: T.text, fontSize: 16, fontWeight: "800", marginBottom: 6 },
  blurb: { color: T.textDim, fontSize: 13, lineHeight: 19, marginBottom: 10 },
  refRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: T.surface,
    borderWidth: 1,
    borderColor: T.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 11,
    marginBottom: 6,
  },
  refTitle: { color: T.text, fontSize: 14, fontWeight: "700", lineHeight: 19 },
  refPub: { color: T.textFaint, fontSize: 12, marginTop: 2 },
  footer: { color: T.textFaint, fontSize: 12, lineHeight: 18, marginTop: 8, textAlign: "center" },
  link: { color: T.accent, fontWeight: "700" },
});
