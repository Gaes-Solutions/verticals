import { fecha, money } from "@/lib/format";
import { type GiftCard, cancelarGiftCard, emitirGiftCard, listGiftCards } from "@/services/negocio";
import { colors, radius, shadow, space } from "@/theme";
import { Badge, Button, Card, EmptyState, Icon, Input, Loading } from "@/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Alert, FlatList, StyleSheet, Text, View } from "react-native";

function tono(e: string): "ok" | "danger" | "neutral" {
  if (e === "activa") return "ok";
  if (e === "cancelada") return "danger";
  return "neutral";
}

export default function Monedero() {
  const qc = useQueryClient();
  const [monto, setMonto] = useState("");
  const q = useQuery({ queryKey: ["gift-cards"], queryFn: listGiftCards });

  const emitir = useMutation({
    mutationFn: () => emitirGiftCard(monto),
    onSuccess: (c) => {
      setMonto("");
      void qc.invalidateQueries({ queryKey: ["gift-cards"] });
      Alert.alert("Tarjeta emitida ✓", `Código ${c.codigo} · ${money(c.saldoActual)}`);
    },
    onError: (e) => Alert.alert("No se pudo emitir", e instanceof Error ? e.message : "Error"),
  });

  const cancelar = useMutation({
    mutationFn: (c: GiftCard) => cancelarGiftCard(c.id),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["gift-cards"] }),
    onError: (e) => Alert.alert("No se pudo cancelar", e instanceof Error ? e.message : "Error"),
  });

  return (
    <FlatList
      style={{ backgroundColor: colors.bg }}
      contentContainerStyle={s.list}
      data={q.data ?? []}
      keyExtractor={(c) => c.id}
      refreshing={q.isFetching}
      onRefresh={() => q.refetch()}
      ListHeaderComponent={
        <Card style={{ marginBottom: space.sm }}>
          <Text style={s.cardTitle}>Emitir tarjeta de regalo</Text>
          <Text style={s.cardSub}>Vende saldo por adelantado (MXN).</Text>
          <View style={{ height: space.sm }} />
          <Input
            icon="cash"
            value={monto}
            onChangeText={setMonto}
            placeholder="0.00"
            keyboardType="decimal-pad"
          />
          <View style={{ height: space.sm }} />
          <Button
            label="Emitir tarjeta"
            icon="card"
            busy={emitir.isPending}
            disabled={!monto || Number(monto) <= 0}
            onPress={() => emitir.mutate()}
          />
        </Card>
      }
      ListEmptyComponent={<EmptyState icon="card-outline" title="Sin tarjetas emitidas" />}
      renderItem={({ item }) => (
        <View style={s.card}>
          <View style={s.gcIcon}>
            <Icon name="card" size={20} color={colors.brand} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={s.codigo}>{item.codigo}</Text>
            <Text style={s.meta}>Emitida {fecha(item.createdAt)}</Text>
          </View>
          <View style={s.right}>
            <Text style={s.saldo}>{money(item.saldoActual)}</Text>
            <Badge label={item.estado} tone={tono(item.estado)} />
          </View>
          {item.estado === "activa" ? (
            <Icon
              name="close-circle"
              size={24}
              color={colors.danger}
              onPress={() =>
                Alert.alert("Cancelar tarjeta", `¿Cancelar ${item.codigo}?`, [
                  { text: "No" },
                  {
                    text: "Sí, cancelar",
                    style: "destructive",
                    onPress: () => cancelar.mutate(item),
                  },
                ])
              }
            />
          ) : null}
        </View>
      )}
      ListFooterComponent={q.isLoading ? <Loading /> : null}
    />
  );
}

const s = StyleSheet.create({
  list: { padding: space.lg, gap: space.sm },
  cardTitle: { fontSize: 16, fontWeight: "800", color: colors.ink },
  cardSub: { fontSize: 13, color: colors.muted, marginTop: 2 },
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.md,
    padding: space.md,
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    ...shadow.card,
  },
  gcIcon: {
    width: 40,
    height: 40,
    borderRadius: radius.sm,
    backgroundColor: colors.brandLight,
    alignItems: "center",
    justifyContent: "center",
  },
  codigo: { fontWeight: "700", color: colors.ink, fontSize: 15, fontVariant: ["tabular-nums"] },
  meta: { color: colors.faint, fontSize: 12, marginTop: 2 },
  right: { alignItems: "flex-end", gap: 3 },
  saldo: { fontWeight: "800", color: colors.ink, fontSize: 15 },
});
