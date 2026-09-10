import { useAuth } from "@/lib/auth-store";
import { fecha } from "@/lib/format";
import { listNotificaciones, marcarLeida, marcarTodasLeidas } from "@/services/cliente";
import { colors, radius, shadow, space } from "@/theme";
import { EmptyState, EntraParaVer, Loading } from "@/ui";
import { CommerceError } from "@/ui/CommerceError";
import { Screen } from "@/ui/Screen";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FlatList, Pressable, StyleSheet, Text, View } from "react-native";

export default function Notificaciones() {
  const conSesion = useAuth((sel) => sel.status) === "signedIn";
  if (!conSesion)
    return (
      <EntraParaVer
        icono="notifications"
        titulo="Tus avisos"
        texto="Te avisamos cuando tu pedido cambie de estado o haya una promoción."
      />
    );
  const { tenantSlug, user } = useAuth();
  const queryKey = ["notificaciones", tenantSlug, user?.id];
  const qc = useQueryClient();
  const q = useQuery({ queryKey, retry: false, queryFn: listNotificaciones });
  const invalidar = () => qc.invalidateQueries({ queryKey });
  const leerUna = useMutation({ mutationFn: marcarLeida, onSuccess: invalidar });
  const leerTodas = useMutation({ mutationFn: marcarTodasLeidas, onSuccess: invalidar });
  if (q.isLoading) return <Loading />;
  if (q.isError)
    return (
      <Screen>
        <CommerceError
          error={q.error}
          message="No pudimos cargar tus avisos. Revisa tu conexión y vuelve a intentar."
          retry={() => void q.refetch()}
        />
      </Screen>
    );
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
        <>
          {leerUna.isError || leerTodas.isError ? (
            <CommerceError
              error={leerUna.error ?? leerTodas.error}
              message="No pudimos confirmar que los avisos quedaron leídos. Actualiza para revisar su estado."
              retry={() => {
                leerUna.reset();
                leerTodas.reset();
                void q.refetch();
              }}
            />
          ) : null}
          {noLeidas > 0 ? (
            <Pressable
              style={s.leerTodas}
              disabled={leerTodas.isPending || leerUna.isPending}
              onPress={() => leerTodas.mutate()}
            >
              <Text style={s.leerTodasText}>Marcar todo como leído ({noLeidas})</Text>
            </Pressable>
          ) : null}
        </>
      }
      ListEmptyComponent={<EmptyState icon="notifications-outline" title="No tienes avisos" />}
      renderItem={({ item }) => (
        <Pressable
          style={[s.card, !item.leida && s.nueva]}
          onPress={() => {
            if (!item.leida && !leerUna.isPending && !leerTodas.isPending) leerUna.mutate(item.id);
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
