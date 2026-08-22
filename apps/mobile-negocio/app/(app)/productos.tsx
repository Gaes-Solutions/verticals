import { money } from "@/lib/format";
import { listProductos } from "@/services/negocio";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { ActivityIndicator, FlatList, StyleSheet, Text, TextInput, View } from "react-native";

export default function Productos() {
  const [q, setQ] = useState("");
  const query = useQuery({
    queryKey: ["productos", q],
    queryFn: () => listProductos(q),
  });

  return (
    <View style={s.root}>
      <TextInput
        style={s.search}
        value={q}
        onChangeText={setQ}
        placeholder="Buscar por nombre o código…"
        autoCorrect={false}
      />
      {query.isLoading ? (
        <ActivityIndicator style={{ marginTop: 32 }} color="#0f766e" />
      ) : (
        <FlatList
          contentContainerStyle={s.list}
          data={query.data?.items ?? []}
          keyExtractor={(p) => p.id}
          ListEmptyComponent={<Text style={s.empty}>Sin productos.</Text>}
          renderItem={({ item }) => (
            <View style={s.card}>
              <View style={{ flex: 1 }}>
                <Text style={s.nombre} numberOfLines={1}>
                  {item.nombre}
                </Text>
                <Text style={s.sku}>{item.skuPadre}</Text>
              </View>
              <Text style={s.precio}>{money(item.variantes[0]?.precioBase ?? "0")}</Text>
            </View>
          )}
        />
      )}
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, padding: 16 },
  search: {
    backgroundColor: "#fff",
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    marginBottom: 12,
  },
  list: { gap: 10, paddingBottom: 20 },
  card: {
    backgroundColor: "#fff",
    borderRadius: 14,
    padding: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  nombre: { fontWeight: "600", color: "#0f172a", fontSize: 15 },
  sku: { color: "#94a3b8", fontSize: 12, marginTop: 2 },
  precio: { fontWeight: "800", color: "#0f172a", fontSize: 15 },
  empty: { textAlign: "center", color: "#94a3b8", marginTop: 40 },
});
