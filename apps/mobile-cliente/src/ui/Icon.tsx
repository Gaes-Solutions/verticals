import { Ionicons } from "@expo/vector-icons";
import { Pressable } from "react-native";
import { colors } from "../theme";

export type IconName = keyof typeof Ionicons.glyphMap;

export function Icon({
  name,
  size = 22,
  color = colors.text,
  onPress,
}: {
  name: IconName;
  size?: number;
  color?: string;
  onPress?: () => void;
}) {
  if (!onPress) return <Ionicons name={name} size={size} color={color} />;
  // hitSlop para que íconos pequeños (18-26px) conserven target táctil ≥40px.
  return (
    <Pressable accessibilityRole="button" hitSlop={12} onPress={onPress}>
      <Ionicons name={name} size={size} color={color} />
    </Pressable>
  );
}
