import type { ReactNode } from "react";
import { type StyleProp, StyleSheet, View, type ViewStyle } from "react-native";
import { colors } from "../theme";

export function Screen({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[s.root, style]}>{children}</View>;
}

const s = StyleSheet.create({ root: { flex: 1, backgroundColor: colors.bg } });
