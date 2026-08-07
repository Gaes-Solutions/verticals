import { StyleSheet, Text, View } from "react-native";

export default function Reportes() {
  return (
    <View style={s.root}>
      <Text style={s.title}>Reportes</Text>
      <Text style={s.text}>Aquí verás ventas por día, producto y vendedor. (Fase 2)</Text>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, padding: 20, gap: 8 },
  title: { fontSize: 20, fontWeight: "800", color: "#0f172a" },
  text: { fontSize: 14, color: "#64748b" },
});
