import { commerceError } from "@/lib/commerce-errors";
import { colors, space } from "@/theme";
import { Text, View } from "react-native";
import { Button } from "./Button";
export function CommerceError({
  error,
  retry,
  message,
}: { error: unknown; retry: () => void; message?: string }) {
  return (
    <View style={{ gap: space.md, padding: space.lg }}>
      <Text accessibilityRole="alert" style={{ color: colors.danger }}>
        {message ?? commerceError(error)}
      </Text>
      <Button label="Reintentar" variant="outline" onPress={retry} />
    </View>
  );
}
