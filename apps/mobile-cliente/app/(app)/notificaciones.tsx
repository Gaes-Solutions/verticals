import { fecha } from "@/lib/format";
import { listNotificaciones, marcarLeida, marcarTodasLeidas } from "@/services/cliente";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from "react-native";

export default function Notificaciones() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["notificaciones"], queryFn: listNotificaciones });

  const invalidar = () => qc.invalidateQueries({ queryKey: ["notificaciones"] });
  const leerUna = useMutation({ mutationFn: marcarLeida, onSuccess: invalidar });
  const leerTodas = useMutation({ mutationFn: marcarTodasLeidas, onSuccess: invalidar });

  if (q.isLoading) {
    return <ActivityIndicator style={{ marginTop: 40 }} color="#4f46e5" />;
  }

  const noLeidas = q.data?.noLeidas ?? 0;

  return (
    <FlatList
      contentContainerStyle={s.root}
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
      ListEmptyComponent={<Text style={s.empty}>No tienes avisos.</Text>}
      renderItem={({ item }) => (
        <Pressable
          style={[s.card, !item.leida && s.cardNueva]}
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
  root: { padding: 16, gap: 10 },
  leerTodas: { alignItems: "flex-end", paddingBottom: 4 },
  leerTodasText: { color: "#4f46e5", fontWeight: "600", fontSize: 13 },
  card: { backgroundColor: "#fff", borderRadius: 14, padding: 14, gap: 4 },
  cardNueva: { borderLeftWidth: 3, borderLeftColor: "#4f46e5" },
  top: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 8 },
  titulo: { flex: 1, fontWeight: "700", color: "#0f172a", fontSize: 15 },
  dot: { width: 9, height: 9, borderRadius: 999, backgroundColor: "#4f46e5" },
  cuerpo: { color: "#475569", fontSize: 14 },
  fecha: { color: "#94a3b8", fontSize: 12, marginTop: 2 },
  empty: { textAlign: "center", color: "#94a3b8", marginTop: 40 },
});
