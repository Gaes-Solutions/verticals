import { StyleSheet, Text, View } from "react-native";
import { colors, space } from "../theme";
import { Icon, type IconName } from "./Icon";

export function EmptyState({
  icon = "file-tray-outline",
  title,
  subtitle,
  tone = "default",
}: {
  icon?: IconName;
  title: string;
  subtitle?: string;
  /** "onDark" para superficies siempre oscuras (p. ej. la pantalla de reposo). */
  tone?: "default" | "onDark";
}) {
  const onDark = tone === "onDark";
  return (
    <View style={s.wrap}>
      <View style={[s.circle, onDark && s.circleOnDark]}>
        <Icon name={icon} size={30} color={onDark ? colors.onDarkMuted : colors.faint} />
      </View>
      <Text style={[s.title, onDark && { color: colors.onDark }]}>{title}</Text>
      {subtitle ? (
        <Text style={[s.sub, onDark && { color: colors.onDarkMuted }]}>{subtitle}</Text>
      ) : null}
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { alignItems: "center", paddingVertical: 48, gap: space.sm },
  circle: {
    width: 68,
    height: 68,
    borderRadius: 999,
    backgroundColor: colors.line,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
  },
  circleOnDark: { backgroundColor: "rgba(255,255,255,0.14)" },
  title: { fontSize: 16, fontWeight: "700", color: colors.text },
  sub: { fontSize: 14, color: colors.faint, textAlign: "center", paddingHorizontal: 32 },
});
