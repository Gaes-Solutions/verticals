import { Ionicons } from "@expo/vector-icons";
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
  return <Ionicons name={name} size={size} color={color} onPress={onPress} />;
}
