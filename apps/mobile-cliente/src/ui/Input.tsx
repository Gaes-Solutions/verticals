import { StyleSheet, Text, TextInput, type TextInputProps, View } from "react-native";
import { colors, radius, space } from "../theme";
import { Icon, type IconName } from "./Icon";

export function Input({
  label,
  icon,
  ...props
}: TextInputProps & { label?: string; icon?: IconName }) {
  return (
    <View style={{ gap: 6 }}>
      {label ? <Text style={s.label}>{label}</Text> : null}
      <View style={s.wrap}>
        {icon ? <Icon name={icon} size={18} color={colors.faint} /> : null}
        <TextInput style={s.input} placeholderTextColor={colors.faint} {...props} />
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  label: { fontSize: 13, fontWeight: "600", color: colors.text },
  wrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.md,
    paddingHorizontal: 14,
  },
  input: { flex: 1, paddingVertical: 12, fontSize: 16, color: colors.ink },
});
