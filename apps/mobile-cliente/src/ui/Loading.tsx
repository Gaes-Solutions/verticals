import { ActivityIndicator, View } from "react-native";
import { colors } from "../theme";

export function Loading() {
  return (
    <View style={{ flex: 1, alignItems: "center", justifyContent: "center", paddingVertical: 60 }}>
      <ActivityIndicator size="large" color={colors.brand} />
    </View>
  );
}
