import { useState } from "react";
import { Image, type StyleProp, StyleSheet, Text, View, type ViewStyle } from "react-native";
import { colors } from "../theme";
import { Icon } from "./Icon";
export function ProductPhoto({
  uri,
  style,
  label,
}: { uri?: string; style?: StyleProp<ViewStyle>; label?: string }) {
  return (
    <View style={[s.wrap, style]}>
      <Photo key={uri} uri={uri} label={label} />
    </View>
  );
}
function Photo({ uri, label }: { uri?: string; label?: string }) {
  const [failed, setFailed] = useState(false);
  if (!uri || failed)
    return (
      <View style={s.empty}>
        <Icon name="image-outline" color={colors.faint} size={32} />
        <Text style={s.text}>Imagen no disponible</Text>
      </View>
    );
  return (
    <Image
      source={{ uri }}
      accessibilityLabel={label}
      style={s.image}
      resizeMode="contain"
      onError={() => setFailed(true)}
    />
  );
}
const s = StyleSheet.create({
  wrap: { backgroundColor: "#f3f5f0", overflow: "hidden", justifyContent: "center" },
  image: { width: "100%", height: "100%" },
  empty: { flex: 1, alignItems: "center", justifyContent: "center", gap: 8, padding: 12 },
  text: { fontSize: 11, color: colors.muted, textAlign: "center" },
});
