import { type Flow, listEventosFlow, listFlows, runFlows, toggleFlow } from "@/services/negocio";
import { colors, radius, shadow, space } from "@/theme";
import { Button, EmptyState, Icon, Loading } from "@/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Alert, FlatList, StyleSheet, Switch, Text, View } from "react-native";

export default function Automatizaciones() {
  const qc = useQueryClient();
  const flows = useQuery({ queryKey: ["flows"], queryFn: listFlows });
  const eventos = useQuery({ queryKey: ["flows-eventos"], queryFn: listEventosFlow });
  const label = (ev: string) => eventos.data?.find((e) => e.evento === ev)?.label ?? ev;

  const toggle = useMutation({
    mutationFn: ({ f }: { f: Flow }) => toggleFlow(f.id, !f.isActive),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["flows"] }),
    onError: (e) => Alert.alert("No se pudo", e instanceof Error ? e.message : "Error"),
  });
  const run = useMutation({
    mutationFn: runFlows,
    onSuccess: (r) => Alert.alert("Ejecutado", `${r.encolados} mensajes encolados.`),
    onError: (e) => Alert.alert("No se pudo", e instanceof Error ? e.message : "Error"),
  });

  if (flows.isLoading) return <Loading />;

  return (
    <FlatList
      style={{ backgroundColor: colors.bg }}
      contentContainerStyle={s.list}
      data={flows.data ?? []}
      keyExtractor={(f) => f.id}
      refreshing={flows.isFetching}
      onRefresh={() => flows.refetch()}
      ListHeaderComponent={
        <View style={s.header}>
          <Text style={s.intro}>
            Mensajes automáticos por evento (bienvenida, carrito abandonado…).
          </Text>
          <Button
            label="Ejecutar ahora"
            icon="play"
            busy={run.isPending}
            onPress={() => run.mutate()}
          />
        </View>
      }
      ListEmptyComponent={<EmptyState icon="flash-outline" title="Sin automatizaciones" />}
      renderItem={({ item }) => (
        <View style={s.card}>
          <View style={s.icon}>
            <Icon name="flash" size={18} color={colors.brand} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={s.nombre}>{item.campanaNombre}</Text>
            <Text style={s.meta}>
              {label(item.evento)} · {item.canal}
              {item.dias ? ` · ${item.dias} días` : ""}
            </Text>
          </View>
          <Switch
            value={item.isActive}
            onValueChange={() => toggle.mutate({ f: item })}
            trackColor={{ true: colors.brand, false: colors.line }}
          />
        </View>
      )}
    />
  );
}

const s = StyleSheet.create({
  list: { padding: space.lg, gap: space.sm },
  header: { gap: space.sm, marginBottom: space.sm },
  intro: { color: colors.muted, fontSize: 14 },
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
    width: 40,
    height: 40,
    borderRadius: radius.sm,
    backgroundColor: colors.brandLight,
    alignItems: "center",
    justifyContent: "center",
  },
  nombre: { fontWeight: "700", color: colors.ink, fontSize: 15 },
  meta: { color: colors.muted, fontSize: 13, marginTop: 2 },
});
