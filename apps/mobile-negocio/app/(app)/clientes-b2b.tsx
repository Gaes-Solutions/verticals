import { listClientesB2b } from "@/services/negocio";
import { colors, radius, shadow, space } from "@/theme";
import { Badge, EmptyState, Icon, Input, Loading } from "@/ui";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { FlatList, StyleSheet, Text, View } from "react-native";

export default function ClientesB2b() {
  const [q, setQ] = useState("");
  const query = useQuery({ queryKey: ["clientes-b2b", q], queryFn: () => listClientesB2b(q) });

  return (
    <View style={s.root}>
      <View style={s.search}>
        <Input
          icon="search"
          value={q}
          onChangeText={setQ}
          placeholder="Buscar por razón social o RFC…"
          autoCorrect={false}
        />
      </View>
      {query.isLoading ? (
        <Loading />
      ) : (
        <FlatList
          contentContainerStyle={s.list}
          data={query.data?.items ?? []}
          keyExtractor={(c) => c.id}
          refreshing={query.isFetching}
          onRefresh={() => query.refetch()}
          ListEmptyComponent={<EmptyState icon="business-outline" title="Sin clientes B2B" />}
          renderItem={({ item }) => (
            <View style={s.card}>
              <View style={s.icon}>
                <Icon name="business" size={20} color={colors.brand} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.nombre} numberOfLines={1}>
                  {item.razonSocial}
                </Text>
                <Text style={s.rfc}>{item.rfc}</Text>
                {item.emailPrincipal ? <Text style={s.email}>{item.emailPrincipal}</Text> : null}
              </View>
              {item.condicionesPago !== "contado" && item.diasCreditoDefault > 0 ? (
                <Badge label={`${item.diasCreditoDefault} días`} tone="info" />
              ) : (
                <Badge label="contado" tone="neutral" />
              )}
            </View>
          )}
        />
      )}
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  search: { padding: space.lg, paddingBottom: space.sm },
  list: { paddingHorizontal: space.lg, paddingBottom: space.xl, gap: space.sm },
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.md,
    padding: space.md,
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    ...shadow.card,
  },
  icon: {
    width: 42,
    height: 42,
    borderRadius: radius.sm,
    backgroundColor: colors.brandLight,
    alignItems: "center",
    justifyContent: "center",
  },
  nombre: { fontWeight: "700", color: colors.ink, fontSize: 15 },
  rfc: { color: colors.muted, fontSize: 13, marginTop: 2, fontVariant: ["tabular-nums"] },
  email: { color: colors.faint, fontSize: 12, marginTop: 1 },
});
