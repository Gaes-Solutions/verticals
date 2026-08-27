import { fecha } from "@/lib/format";
import { listNotificaciones, marcarLeida, marcarTodasLeidas } from "@/services/cliente";
import { colors, radius, shadow, space } from "@/theme";
import { EmptyState, Loading } from "@/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FlatList, Pressable, StyleSheet, Text, View } from "react-native";

export default function Notificaciones() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["notificaciones"], queryFn: listNotificaciones });
  const invalidar = () => qc.invalidateQueries({ queryKey: ["notificaciones"] });
  const leerUna = useMutation({ mutationFn: marcarLeida, onSuccess: invalidar });
  const leerTodas = useMutation({ mutationFn: marcarTodasLeidas, onSuccess: invalidar });
  if (q.isLoading) return <Loading />;
  const noLeidas = q.data?.noLeidas ?? 0;

  return (
    <FlatList
      style={{ backgroundColor: colors.bg }}
      contentContainerStyle={s.list}
      data={q.data?.items ?? []}
      keyExtractor={(n) => n.id}
      refreshing={q.isFetching}
      onRefresh={() => q.refetch()}
      ListHeaderComponent={
        noLeidas > 0 ? (
          <Pressable style={s.leerTodas} onPress={() => leerTodas.mutate()}>
            <Text style={s.leerTodasText}>Marcar todo como leído ({noLeidas})</Text>
          </Pressable>
        ) : null
      }
      ListEmptyComponent={<EmptyState icon="notifications-outline" title="No tienes avisos" />}
      renderItem={({ item }) => (
        <Pressable
          style={[s.card, !item.leida && s.nueva]}
          onPress={() => {
            if (!item.leida) leerUna.mutate(item.id);
          }}
        >
          <View style={s.top}>
            <Text style={s.titulo} numberOfLines={1}>
              {item.titulo}
            </Text>
            {!item.leida ? <View style={s.dot} /> : null}
          </View>
          <Text style={s.cuerpo}>{item.cuerpo}</Text>
          <Text style={s.fecha}>{fecha(item.createdAt)}</Text>
        </Pressable>
      )}
    />
  );
}

const s = StyleSheet.create({
  list: { padding: space.lg, gap: space.sm },
  leerTodas: { alignItems: "flex-end", paddingBottom: 4 },
  leerTodasText: { color: colors.brand, fontWeight: "600", fontSize: 13 },
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.md,
    padding: space.md,
    gap: 4,
    ...shadow.card,
  },
  nueva: { borderLeftWidth: 3, borderLeftColor: colors.brand },
  top: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 8 },
  titulo: { flex: 1, fontWeight: "700", color: colors.ink, fontSize: 15 },
  dot: { width: 9, height: 9, borderRadius: 999, backgroundColor: colors.brand },
  cuerpo: { color: colors.text, fontSize: 14 },
  fecha: { color: colors.faint, fontSize: 12, marginTop: 2 },
});
