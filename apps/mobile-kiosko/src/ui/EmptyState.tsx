import { StyleSheet, Text, View } from "react-native";
import { colors, space } from "../theme";
import { Icon, type IconName } from "./Icon";

export function EmptyState({
  icon = "file-tray-outline",
  title,
  subtitle,
}: {
  icon?: IconName;
  title: string;
  subtitle?: string;
}) {
  return (
    <View style={s.wrap}>
      <View style={s.circle}>
        <Icon name={icon} size={30} color={colors.faint} />
      </View>
      <Text style={s.title}>{title}</Text>
      {subtitle ? <Text style={s.sub}>{subtitle}</Text> : null}
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
  title: { fontSize: 16, fontWeight: "700", color: colors.text },
  sub: { fontSize: 14, color: colors.faint, textAlign: "center", paddingHorizontal: 32 },
});
