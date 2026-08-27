import { fecha } from "@/lib/format";
import {
  type AccionPromo,
  type PromoItem,
  cambiarEstadoPromo,
  listPromociones,
} from "@/services/negocio";
import { colors, radius, shadow, space } from "@/theme";
import { Badge, EmptyState, Icon, Loading } from "@/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Alert, FlatList, Pressable, StyleSheet, Text, View } from "react-native";

const TIPO_LABEL: Record<string, string> = {
  descuento_pct: "% de descuento",
  monto_fijo: "Monto fijo",
  envio_gratis: "Envío gratis",
  producto_gratis: "Producto gratis",
  "2x1": "2x1",
};

function tono(s: string): "ok" | "warn" | "info" | "neutral" {
  if (s === "activa") return "ok";
  if (s === "pausada") return "warn";
  if (s === "programada" || s === "expirada") return "info";
  return "neutral";
}

function resumen(p: PromoItem): string {
  if (p.tipo === "descuento_pct") return `${p.acciones?.valor ?? 0}% de descuento`;
  return TIPO_LABEL[p.tipo] ?? p.tipo;
}

export default function Promociones() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["promociones"], queryFn: listPromociones });

  const cambiar = useMutation({
    mutationFn: ({ id, accion }: { id: string; accion: AccionPromo }) =>
      cambiarEstadoPromo(id, accion),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["promociones"] }),
    onError: (e) => Alert.alert("No se pudo", e instanceof Error ? e.message : "Error"),
  });

  if (q.isLoading) return <Loading />;

  return (
    <FlatList
      style={{ backgroundColor: colors.bg }}
      contentContainerStyle={s.list}
      data={q.data ?? []}
      keyExtractor={(p) => p.id}
      refreshing={q.isFetching}
      onRefresh={() => q.refetch()}
      ListEmptyComponent={<EmptyState icon="megaphone-outline" title="Sin promociones" />}
      renderItem={({ item }) => (
        <View style={s.card}>
          <View style={s.top}>
            <Text style={s.nombre} numberOfLines={1}>
              {item.nombre}
            </Text>
            <Badge label={item.status} tone={tono(item.status)} />
          </View>
          <Text style={s.resumen}>{resumen(item)}</Text>
          {item.descripcion ? (
            <Text style={s.desc} numberOfLines={2}>
              {item.descripcion}
            </Text>
          ) : null}
          <Text style={s.vig}>
            <Icon name="calendar" size={12} color={colors.faint} /> {fecha(item.vigenciaInicio)}
            {item.vigenciaFin ? ` – ${fecha(item.vigenciaFin)}` : ""}
          </Text>
          <View style={s.acciones}>
            {item.status !== "activa" ? (
              <AccBtn
                icon="play"
                label="Activar"
                onPress={() => cambiar.mutate({ id: item.id, accion: "activar" })}
              />
            ) : (
              <AccBtn
                icon="pause"
                label="Pausar"
                onPress={() => cambiar.mutate({ id: item.id, accion: "pausar" })}
              />
            )}
            <AccBtn
              icon="archive"
              label="Archivar"
              muted
              onPress={() => cambiar.mutate({ id: item.id, accion: "archivar" })}
            />
          </View>
        </View>
      )}
    />
  );
}

function AccBtn({
  icon,
  label,
  onPress,
  muted,
}: { icon: "play" | "pause" | "archive"; label: string; onPress: () => void; muted?: boolean }) {
  return (
    <Pressable style={[s.accBtn, muted && s.accBtnMuted]} onPress={onPress}>
      <Icon name={icon} size={16} color={muted ? colors.muted : colors.brand} />
      <Text style={[s.accText, muted && { color: colors.muted }]}>{label}</Text>
    </Pressable>
  );
}

const s = StyleSheet.create({
  list: { padding: space.lg, gap: space.sm },
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.md,
    padding: space.md,
    gap: 6,
    ...shadow.card,
  },
  top: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  nombre: { fontWeight: "700", color: colors.ink, fontSize: 15, flex: 1, marginRight: space.sm },
  resumen: { color: colors.brand, fontSize: 14, fontWeight: "600" },
  desc: { color: colors.muted, fontSize: 13 },
  vig: { color: colors.faint, fontSize: 12 },
  acciones: { flexDirection: "row", gap: space.sm, marginTop: space.sm },
  accBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: colors.brandLight,
    borderRadius: radius.sm,
    paddingVertical: 8,
    paddingHorizontal: 14,
  },
  accBtnMuted: { backgroundColor: colors.bg },
  accText: { color: colors.brand, fontWeight: "700", fontSize: 13 },
});
