import { useAuth } from "@/lib/auth-store";
import { Redirect } from "expo-router";
import { ActivityIndicator, View } from "react-native";

export default function Index() {
  const status = useAuth((s) => s.status);
  if (status === "loading") {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator size="large" color="#0f766e" />
      </View>
    );
  }
  return <Redirect href={status === "signedIn" ? "/(app)" : "/login"} />;
}
