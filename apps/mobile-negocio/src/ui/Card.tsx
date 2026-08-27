import type { ReactNode } from "react";
import { type StyleProp, StyleSheet, View, type ViewStyle } from "react-native";
import { colors, radius, shadow, space } from "../theme";

export function Card({
  children,
  style,
  padded = true,
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  padded?: boolean;
}) {
  return <View style={[s.card, padded && s.padded, style]}>{children}</View>;
}

const s = StyleSheet.create({
  card: { backgroundColor: colors.card, borderRadius: radius.lg, ...shadow.card },
  padded: { padding: space.lg },
});
