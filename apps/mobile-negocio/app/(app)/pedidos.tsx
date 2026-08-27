import { fecha, money } from "@/lib/format";
import {
  getConfigEstados,
  getPedidoDetalle,
  listPedidosEcom,
  transicionarPedido,
} from "@/services/negocio";
import { colors, radius, shadow, space } from "@/theme";
import { Badge, EmptyState, Icon, Loading } from "@/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import {
  Alert,
  FlatList,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

function tono(estado: string): "ok" | "danger" | "info" | "warn" | "neutral" {
  if (estado === "cancelado") return "danger";
  if (["entregado", "recogido"].includes(estado)) return "ok";
  if (["enviado", "en_camino", "listo_pickup"].includes(estado)) return "info";
  if (["pendiente", "confirmado", "preparando"].includes(estado)) return "warn";
  return "neutral";
}

export default function Pedidos() {
  const [filtro, setFiltro] = useState("");
  const [detId, setDetId] = useState<string | null>(null);

  const config = useQuery({ queryKey: ["pedidos-config"], queryFn: getConfigEstados });
  const q = useQuery({
    queryKey: ["pedidos", filtro],
    queryFn: () => listPedidosEcom(filtro || undefined),
  });
  const etiqueta = (e: string) => config.data?.etiquetas[e] ?? e;

  return (
    <View style={s.root}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={s.chipsWrap}
        contentContainerStyle={s.chips}
      >
        <Chip label="Todos" active={!filtro} onPress={() => setFiltro("")} />
        {(config.data?.estados ?? []).map((e) => (
          <Chip key={e} label={etiqueta(e)} active={filtro === e} onPress={() => setFiltro(e)} />
        ))}
      </ScrollView>

      {q.isLoading ? (
        <Loading />
      ) : (
        <FlatList
          contentContainerStyle={s.list}
          data={q.data?.items ?? []}
          keyExtractor={(p) => p.id}
          refreshing={q.isFetching}
          onRefresh={() => q.refetch()}
          ListEmptyComponent={
            <EmptyState
              icon="cube-outline"
              title="Sin pedidos"
              subtitle={filtro ? `Ninguno en "${etiqueta(filtro)}"` : "Aún no hay pedidos."}
            />
          }
          renderItem={({ item }) => (
            <Pressable style={s.card} onPress={() => setDetId(item.id)}>
              <View style={s.cardTop}>
                <Text style={s.folio}>#{item.folioPublico}</Text>
                <Text style={s.total}>{money(item.total)}</Text>
              </View>
              <View style={s.cardTop}>
                <Text style={s.meta} numberOfLines={1}>
                  {item.cliente?.nombre ?? "Cliente"} · {fecha(item.createdAt)}
                </Text>
                <Badge
                  label={item.statusLabel ?? etiqueta(item.statusPedido)}
                  tone={tono(item.statusPedido)}
                />
              </View>
            </Pressable>
          )}
        />
      )}

      <DetalleModal
        id={detId}
        etiqueta={etiqueta}
        estados={config.data?.estados ?? []}
        onClose={() => setDetId(null)}
      />
    </View>
  );
}

function DetalleModal({
  id,
  etiqueta,
  estados,
  onClose,
}: {
  id: string | null;
  etiqueta: (e: string) => string;
  estados: string[];
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const det = useQuery({
    queryKey: ["pedido", id],
    queryFn: () => getPedidoDetalle(id as string),
    enabled: !!id,
  });
  const p = det.data;

  const trans = useMutation({
    mutationFn: (nuevo: string) => transicionarPedido(id as string, nuevo),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["pedido", id] });
      void qc.invalidateQueries({ queryKey: ["pedidos"] });
    },
    onError: (e) => Alert.alert("No se pudo cambiar", e instanceof Error ? e.message : "Error"),
  });

  return (
    <Modal visible={!!id} animationType="slide" onRequestClose={onClose}>
      <View style={s.modalRoot}>
        <View style={s.modalHead}>
          <Text style={s.modalTitle}>{p ? `Pedido #${p.folioPublico}` : "Pedido"}</Text>
          <Pressable onPress={onClose}>
            <Icon name="close" size={26} color={colors.muted} />
          </Pressable>
        </View>

        {det.isLoading || !p ? (
          <Loading />
        ) : (
          <ScrollView contentContainerStyle={s.modalBody}>
            <View style={s.rowBetween}>
              <Badge
                label={p.statusLabel ?? etiqueta(p.statusPedido)}
                tone={tono(p.statusPedido)}
              />
              <Text style={s.total}>{money(p.total)}</Text>
            </View>
            <Text style={s.sub}>
              {p.cliente?.nombre ?? "Cliente"} · {fecha(p.createdAt)}
            </Text>

            <Text style={s.h}>Productos</Text>
            <View style={s.box}>
              {p.items.map((it, i) => (
                <View
                  key={`${it.nombre}-${it.precioUnitario}-${it.cantidad}`}
                  style={[s.itemRow, i < p.items.length - 1 && s.itemBorder]}
                >
                  <Text style={s.itemName} numberOfLines={1}>
                    {it.cantidad}× {it.nombre}
                  </Text>
                  <Text style={s.itemVal}>{money(it.subtotal)}</Text>
                </View>
              ))}
            </View>

            {p.eventos.length > 0 && (
              <>
                <Text style={s.h}>Seguimiento</Text>
                <View style={s.box}>
                  {p.eventos.map((ev, i) => (
                    <View key={ev.id} style={s.evRow}>
                      <View style={s.evDotCol}>
                        <View style={[s.evDot, i === 0 && s.evDotOn]} />
                        {i < p.eventos.length - 1 ? <View style={s.evLine} /> : null}
                      </View>
                      <View style={{ flex: 1, paddingBottom: space.md }}>
                        <Text style={s.evText}>{ev.descripcion}</Text>
                        <Text style={s.evDate}>{fecha(ev.createdAt)}</Text>
                      </View>
                    </View>
                  ))}
                </View>
              </>
            )}

            <Text style={s.h}>Cambiar estado</Text>
            <View style={s.estadoBtns}>
              {estados
                .filter((e) => e !== p.statusPedido)
                .map((e) => (
                  <Pressable
                    key={e}
                    style={s.estadoBtn}
                    disabled={trans.isPending}
                    onPress={() => trans.mutate(e)}
                  >
                    <Text style={s.estadoBtnText}>{etiqueta(e)}</Text>
                  </Pressable>
                ))}
            </View>
            <View style={{ height: space.xl }} />
          </ScrollView>
        )}
      </View>
    </Modal>
  );
}

function Chip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable style={[s.chip, active && s.chipOn]} onPress={onPress}>
      <Text style={[s.chipText, active && s.chipTextOn]}>{label}</Text>
    </Pressable>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  chipsWrap: { maxHeight: 56, flexGrow: 0 },
  chips: { paddingHorizontal: space.lg, paddingVertical: space.sm, gap: space.sm },
  chip: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: radius.pill,
    backgroundColor: colors.card,
    ...shadow.card,
  },
  chipOn: { backgroundColor: colors.brand },
  chipText: { color: colors.text, fontWeight: "600", textTransform: "capitalize" },
  chipTextOn: { color: colors.white },
  list: { paddingHorizontal: space.lg, paddingBottom: space.xl, gap: space.sm },
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.md,
    padding: space.md,
    gap: 8,
    ...shadow.card,
  },
  cardTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  folio: { fontWeight: "700", color: colors.ink, fontSize: 15 },
  total: { fontWeight: "800", color: colors.ink, fontSize: 17 },
  meta: { color: colors.muted, fontSize: 13, flex: 1, marginRight: space.sm },
  modalRoot: { flex: 1, backgroundColor: colors.bg, paddingTop: 48 },
  modalHead: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: space.lg,
    paddingBottom: space.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
  },
  modalTitle: { fontSize: 20, fontWeight: "800", color: colors.ink },
  modalBody: { padding: space.lg, gap: space.sm },
  rowBetween: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  sub: { color: colors.muted, fontSize: 14 },
  h: { fontSize: 15, fontWeight: "700", color: colors.ink, marginTop: space.md },
  box: { backgroundColor: colors.card, borderRadius: radius.md, padding: space.md, ...shadow.card },
  itemRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 8,
    gap: space.md,
  },
  itemBorder: { borderBottomWidth: 1, borderBottomColor: colors.line },
  itemName: { flex: 1, color: colors.text, fontSize: 14 },
  itemVal: { color: colors.ink, fontWeight: "700", fontSize: 14 },
  evRow: { flexDirection: "row", gap: space.md },
  evDotCol: { alignItems: "center", width: 16 },
  evDot: { width: 12, height: 12, borderRadius: 999, backgroundColor: colors.line, marginTop: 3 },
  evDotOn: { backgroundColor: colors.brand },
  evLine: { flex: 1, width: 2, backgroundColor: colors.line, marginVertical: 2 },
  evText: { color: colors.text, fontSize: 14 },
  evDate: { color: colors.faint, fontSize: 12, marginTop: 2 },
  estadoBtns: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
  estadoBtn: {
    backgroundColor: colors.brandLight,
    borderRadius: radius.md,
    paddingVertical: 10,
    paddingHorizontal: 16,
  },
  estadoBtnText: { color: colors.brandDark, fontWeight: "700", textTransform: "capitalize" },
});
