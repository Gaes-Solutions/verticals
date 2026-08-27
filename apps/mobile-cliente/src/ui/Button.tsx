import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { colors, radius, space } from "../theme";
import { Icon, type IconName } from "./Icon";

type Variant = "primary" | "outline" | "danger" | "ghost";

export function Button({
  label,
  onPress,
  variant = "primary",
  icon,
  busy = false,
  disabled = false,
}: {
  label: string;
  onPress: () => void;
  variant?: Variant;
  icon?: IconName;
  busy?: boolean;
  disabled?: boolean;
}) {
  const off = disabled || busy;
  const txt = variant === "primary" || variant === "danger" ? colors.white : colors.brand;
  return (
    <Pressable
      onPress={onPress}
      disabled={off}
      style={({ pressed }) => [s.base, s[variant], off && s.off, pressed && !off && s.pressed]}
    >
      {busy ? (
        <ActivityIndicator color={txt} />
      ) : (
        <View style={s.row}>
          {icon ? <Icon name={icon} size={18} color={txt} /> : null}
          <Text style={[s.label, { color: txt }]}>{label}</Text>
        </View>
      )}
    </Pressable>
  );
}

const s = StyleSheet.create({
  base: {
    borderRadius: radius.md,
    paddingVertical: 14,
    paddingHorizontal: space.lg,
    alignItems: "center",
  },
  row: { flexDirection: "row", alignItems: "center", gap: space.sm },
  label: { fontSize: 16, fontWeight: "700" },
  primary: { backgroundColor: colors.brand },
  danger: { backgroundColor: colors.danger },
  outline: { borderWidth: 1.5, borderColor: colors.brand, backgroundColor: colors.white },
  ghost: { backgroundColor: "transparent" },
  off: { opacity: 0.5 },
  pressed: { opacity: 0.85 },
});
