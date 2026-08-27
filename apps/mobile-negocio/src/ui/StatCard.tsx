import { StyleSheet, Text, View } from "react-native";
import { colors, radius, shadow, space } from "../theme";
import { Icon, type IconName } from "./Icon";

export function StatCard({
  label,
  value,
  icon,
  highlight = false,
}: {
  label: string;
  value: string;
  icon?: IconName;
  highlight?: boolean;
}) {
  return (
    <View style={[s.card, highlight && s.hi]}>
      <View style={s.top}>
        <Text style={[s.label, highlight && s.onHi]}>{label}</Text>
        {icon ? (
          <Icon name={icon} size={18} color={highlight ? colors.brandLight : colors.faint} />
        ) : null}
      </View>
      <Text style={[s.value, highlight && s.valueHi]}>{value}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  card: {
    flexGrow: 1,
    minWidth: "46%",
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: space.lg,
    gap: 6,
    ...shadow.card,
  },
  hi: { backgroundColor: colors.brand },
  top: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  label: { fontSize: 12, color: colors.muted, fontWeight: "600" },
  onHi: { color: colors.brandLight },
  value: { fontSize: 21, fontWeight: "800", color: colors.ink },
  valueHi: { color: colors.white },
});
