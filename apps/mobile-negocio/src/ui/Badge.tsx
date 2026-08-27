import { StyleSheet, Text, View } from "react-native";
import { colors, radius } from "../theme";

type Tone = "brand" | "ok" | "danger" | "warn" | "info" | "neutral";

const MAP: Record<Tone, { bg: string; fg: string }> = {
  brand: { bg: colors.brandLight, fg: colors.brandDark },
  ok: { bg: colors.okLight, fg: colors.ok },
  danger: { bg: colors.dangerLight, fg: colors.danger },
  warn: { bg: colors.warnLight, fg: colors.warn },
  info: { bg: colors.infoLight, fg: colors.info },
  neutral: { bg: colors.line, fg: colors.muted },
};

export function Badge({ label, tone = "neutral" }: { label: string; tone?: Tone }) {
  const c = MAP[tone];
  return (
    <View style={[s.badge, { backgroundColor: c.bg }]}>
      <Text style={[s.text, { color: c.fg }]}>{label}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: radius.pill,
    alignSelf: "flex-start",
  },
  text: { fontSize: 12, fontWeight: "700", textTransform: "capitalize" },
});
