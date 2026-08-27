import { fecha, money } from "@/lib/format";
import {
  type CxcItem,
  type MetodoPago,
  condonarCxc,
  cxcSaldo,
  getCxcDetalle,
  incobrableCxc,
  listCxc,
  registrarPagoCxc,
} from "@/services/negocio";
import { colors, radius, shadow, space } from "@/theme";
import { Badge, Button, Card, EmptyState, Icon, Input, Loading, StatCard } from "@/ui";
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

const METODOS: { key: MetodoPago; label: string }[] = [
  { key: "efectivo", label: "Efectivo" },
  { key: "transferencia", label: "Transferencia" },
  { key: "tarjeta_debito", label: "Débito" },
  { key: "tarjeta_credito", label: "Crédito" },
];

function tono(e: string): "info" | "warn" | "ok" | "danger" | "neutral" {
  if (e === "vencida") return "warn";
  if (e === "liquidada") return "ok";
  if (e === "incobrable") return "danger";
  if (e === "activa") return "info";
  return "neutral";
}
function nombre(c: CxcItem): string {
  if (c.clienteB2b) return c.clienteB2b.razonSocial;
  if (c.cliente) return `${c.cliente.nombre} ${c.cliente.apellidos ?? ""}`.trim();
  return "Cliente";
}

export default function Cxc() {
  const [detId, setDetId] = useState<string | null>(null);
  const q = useQuery({ queryKey: ["cxc"], queryFn: listCxc });
  const items = q.data?.items ?? [];
  const porCobrar = items
    .filter((c) => ["activa", "vencida"].includes(c.estado))
    .reduce((s, c) => s + cxcSaldo(c), 0);
  const vencido = items.filter((c) => c.estado === "vencida").reduce((s, c) => s + cxcSaldo(c), 0);

  if (q.isLoading) return <Loading />;

  return (
    <View style={s.root}>
      <FlatList
        contentContainerStyle={s.list}
        data={items}
        keyExtractor={(c) => c.id}
        refreshing={q.isFetching}
        onRefresh={() => q.refetch()}
        ListHeaderComponent={
          <View style={s.grid}>
            <StatCard label="Por cobrar" value={money(porCobrar)} icon="cash" highlight />
            <StatCard label="Vencido" value={money(vencido)} icon="alert-circle" />
          </View>
        }
        ListEmptyComponent={<EmptyState icon="wallet-outline" title="Sin cuentas por cobrar" />}
        renderItem={({ item }) => (
          <Pressable style={s.card} onPress={() => setDetId(item.id)}>
            <View style={s.top}>
              <Text style={s.nombre} numberOfLines={1}>
                {nombre(item)}
              </Text>
              <Text style={s.saldo}>{money(cxcSaldo(item))}</Text>
            </View>
            <View style={s.top}>
              <Text style={s.meta}>
                #{item.folio} · vence {fecha(item.fechaVencimiento)}
              </Text>
              <Badge label={item.estado} tone={tono(item.estado)} />
            </View>
          </Pressable>
        )}
      />
      <DetalleModal id={detId} onClose={() => setDetId(null)} />
    </View>
  );
}

function DetalleModal({ id, onClose }: { id: string | null; onClose: () => void }) {
  const qc = useQueryClient();
  const [monto, setMonto] = useState("");
  const [metodo, setMetodo] = useState<MetodoPago>("efectivo");
  const det = useQuery({
    queryKey: ["cxc", id],
    queryFn: () => getCxcDetalle(id as string),
    enabled: !!id,
  });
  const c = det.data;

  const invalidar = () => {
    void qc.invalidateQueries({ queryKey: ["cxc"] });
    void qc.invalidateQueries({ queryKey: ["cxc", id] });
  };
  const err = (e: unknown) => Alert.alert("No se pudo", e instanceof Error ? e.message : "Error");

  const pagar = useMutation({
    mutationFn: () => registrarPagoCxc(id as string, monto, metodo),
    onSuccess: () => {
      setMonto("");
      invalidar();
    },
    onError: err,
  });
  const condonar = useMutation({
    mutationFn: () => condonarCxc(id as string, "Condonado desde app"),
    onSuccess: () => {
      invalidar();
      onClose();
    },
    onError: err,
  });
  const incobrable = useMutation({
    mutationFn: () => incobrableCxc(id as string, "Incobrable desde app"),
    onSuccess: () => {
      invalidar();
      onClose();
    },
    onError: err,
  });

  const abierta = c && ["activa", "vencida"].includes(c.estado);

  return (
    <Modal visible={!!id} animationType="slide" onRequestClose={onClose}>
      <View style={s.modalRoot}>
        <View style={s.modalHead}>
          <Text style={s.modalTitle}>{c ? `#${c.folio}` : "Cuenta"}</Text>
          <Pressable onPress={onClose}>
            <Icon name="close" size={26} color={colors.muted} />
          </Pressable>
        </View>
        {det.isLoading || !c ? (
          <Loading />
        ) : (
          <ScrollView contentContainerStyle={s.modalBody}>
            <View style={s.top}>
              <Text style={s.nombre}>{nombre(c)}</Text>
              <Badge label={c.estado} tone={tono(c.estado)} />
            </View>
            <Card style={s.mt}>
              <Row label="Monto original" value={money(c.montoOriginal)} />
              <Row label="Pagado" value={money(c.montoPagado)} />
              {Number(c.interesAcumulado) > 0 ? (
                <Row label="Interés" value={money(c.interesAcumulado)} />
              ) : null}
              <View style={s.sep} />
              <Row label="Saldo" value={money(cxcSaldo(c))} bold />
            </Card>

            {c.pagos.length > 0 ? (
              <>
                <Text style={s.h}>Pagos</Text>
                <Card>
                  {c.pagos.map((p, i) => (
                    <View key={p.id} style={[s.pagoRow, i < c.pagos.length - 1 && s.pagoBorder]}>
                      <Text style={s.pagoMeta}>
                        {p.metodo} · {fecha(p.createdAt)}
                      </Text>
                      <Text style={s.pagoMonto}>{money(p.monto)}</Text>
                    </View>
                  ))}
                </Card>
              </>
            ) : null}

            {abierta ? (
              <>
                <Text style={s.h}>Registrar abono</Text>
                <Card>
                  <Input
                    icon="cash"
                    value={monto}
                    onChangeText={setMonto}
                    placeholder="0.00"
                    keyboardType="decimal-pad"
                  />
                  <View style={s.metodos}>
                    {METODOS.map((m) => (
                      <Pressable
                        key={m.key}
                        style={[s.metodo, metodo === m.key && s.metodoOn]}
                        onPress={() => setMetodo(m.key)}
                      >
                        <Text style={[s.metodoText, metodo === m.key && s.metodoTextOn]}>
                          {m.label}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                  <View style={{ height: space.sm }} />
                  <Button
                    label="Registrar abono"
                    icon="add-circle"
                    busy={pagar.isPending}
                    disabled={!monto || Number(monto) <= 0}
                    onPress={() => pagar.mutate()}
                  />
                </Card>
                <View style={s.acciones}>
                  <View style={{ flex: 1 }}>
                    <Button
                      label="Condonar"
                      variant="outline"
                      busy={condonar.isPending}
                      onPress={() => condonar.mutate()}
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Button
                      label="Incobrable"
                      variant="danger"
                      busy={incobrable.isPending}
                      onPress={() => incobrable.mutate()}
                    />
                  </View>
                </View>
              </>
            ) : null}
            <View style={{ height: space.xl }} />
          </ScrollView>
        )}
      </View>
    </Modal>
  );
}

function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <View style={s.row}>
      <Text style={[s.rowLabel, bold && { fontWeight: "700", color: colors.ink }]}>{label}</Text>
      <Text style={[s.rowVal, bold && { fontSize: 18 }]}>{value}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  list: { padding: space.lg, gap: space.sm },
  grid: { flexDirection: "row", gap: space.sm, marginBottom: space.sm },
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.md,
    padding: space.md,
    gap: 8,
    ...shadow.card,
  },
  top: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: space.sm,
  },
  nombre: { fontWeight: "700", color: colors.ink, fontSize: 15, flex: 1 },
  saldo: { fontWeight: "800", color: colors.ink, fontSize: 16 },
  meta: { color: colors.muted, fontSize: 12, flex: 1 },
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
  mt: { marginTop: space.sm },
  row: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 6 },
  rowLabel: { color: colors.muted, fontSize: 14 },
  rowVal: { color: colors.ink, fontWeight: "600", fontSize: 14 },
  sep: { height: 1, backgroundColor: colors.line, marginVertical: 6 },
  h: { fontSize: 15, fontWeight: "700", color: colors.ink, marginTop: space.md, marginBottom: 4 },
  pagoRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 8 },
  pagoBorder: { borderBottomWidth: 1, borderBottomColor: colors.line },
  pagoMeta: { color: colors.muted, fontSize: 13, textTransform: "capitalize" },
  pagoMonto: { color: colors.ink, fontWeight: "700", fontSize: 14 },
  metodos: { flexDirection: "row", flexWrap: "wrap", gap: space.sm, marginTop: space.sm },
  metodo: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: radius.md,
    backgroundColor: colors.brandLight,
  },
  metodoOn: { backgroundColor: colors.brand },
  metodoText: { color: colors.brandDark, fontWeight: "700", fontSize: 13 },
  metodoTextOn: { color: colors.white },
  acciones: { flexDirection: "row", gap: space.sm, marginTop: space.sm },
});
