import {
  type InventarioItem,
  type TipoAjuste,
  ajustarInventario,
  listInventario,
  listSucursales,
} from "@/services/negocio";
import { colors, radius, shadow, space } from "@/theme";
import { Badge, Button, EmptyState, Icon, Input, Loading } from "@/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Alert, FlatList, Modal, Pressable, StyleSheet, Text, View } from "react-native";

export default function Inventario() {
  const qc = useQueryClient();
  const [soloBajos, setSoloBajos] = useState(false);
  const [sel, setSel] = useState<InventarioItem | null>(null);

  const sucursales = useQuery({ queryKey: ["sucursales"], queryFn: listSucursales });
  const sucursalId = sucursales.data?.find((x) => x.isDefault)?.id ?? sucursales.data?.[0]?.id;

  const inv = useQuery({
    queryKey: ["inventario", sucursalId, soloBajos],
    queryFn: () => listInventario(sucursalId, soloBajos),
    enabled: !!sucursalId,
  });

  if (!sucursalId || inv.isLoading) return <Loading />;

  return (
    <View style={s.root}>
      <View style={s.filters}>
        <Pressable style={[s.chip, !soloBajos && s.chipOn]} onPress={() => setSoloBajos(false)}>
          <Text style={[s.chipText, !soloBajos && s.chipTextOn]}>Todos</Text>
        </Pressable>
        <Pressable style={[s.chip, soloBajos && s.chipOn]} onPress={() => setSoloBajos(true)}>
          <Text style={[s.chipText, soloBajos && s.chipTextOn]}>Stock bajo</Text>
        </Pressable>
      </View>

      <FlatList
        contentContainerStyle={s.list}
        data={inv.data?.items ?? []}
        keyExtractor={(i) => i.id}
        refreshing={inv.isFetching}
        onRefresh={() => inv.refetch()}
        ListEmptyComponent={<EmptyState icon="cube-outline" title="Sin inventario" />}
        renderItem={({ item }) => {
          const bajo = Number(item.stockActual) <= Number(item.stockMinimo);
          return (
            <Pressable style={s.card} onPress={() => setSel(item)}>
              <View style={{ flex: 1 }}>
                <Text style={s.nombre} numberOfLines={1}>
                  {item.variante.producto.nombre}
                </Text>
                <Text style={s.sku}>{item.variante.sku}</Text>
              </View>
              <View style={s.stockBox}>
                <Text style={[s.stock, bajo && { color: colors.danger }]}>
                  {fmt(item.stockActual)}
                </Text>
                {bajo ? <Badge label="bajo" tone="danger" /> : null}
              </View>
              <Icon name="create-outline" size={20} color={colors.faint} />
            </Pressable>
          );
        }}
      />

      <AjusteModal
        item={sel}
        sucursalId={sucursalId}
        onClose={() => setSel(null)}
        onDone={() => {
          setSel(null);
          void qc.invalidateQueries({ queryKey: ["inventario"] });
        }}
      />
    </View>
  );
}

function AjusteModal({
  item,
  sucursalId,
  onClose,
  onDone,
}: {
  item: InventarioItem | null;
  sucursalId: string;
  onClose: () => void;
  onDone: () => void;
}) {
  const [cantidad, setCantidad] = useState("");
  const [tipo, setTipo] = useState<TipoAjuste>("ajuste_positivo");

  const m = useMutation({
    mutationFn: () =>
      ajustarInventario({
        varianteId: item?.variante.id ?? "",
        sucursalId,
        tipo,
        cantidad,
        motivo: "Ajuste desde app móvil",
      }),
    onSuccess: () => {
      setCantidad("");
      onDone();
    },
    onError: (e) => Alert.alert("No se pudo ajustar", e instanceof Error ? e.message : "Error"),
  });

  return (
    <Modal visible={!!item} transparent animationType="slide" onRequestClose={onClose}>
      <View style={s.backdrop}>
        <View style={s.sheet}>
          <View style={s.sheetHead}>
            <Text style={s.sheetTitle} numberOfLines={1}>
              {item?.variante.producto.nombre}
            </Text>
            <Pressable onPress={onClose}>
              <Icon name="close" size={24} color={colors.muted} />
            </Pressable>
          </View>
          <Text style={s.sheetSub}>Stock actual: {fmt(item?.stockActual ?? "0")}</Text>

          <View style={s.tipoRow}>
            <TipoBtn
              active={tipo === "ajuste_positivo"}
              label="Entrada"
              icon="add-circle"
              onPress={() => setTipo("ajuste_positivo")}
            />
            <TipoBtn
              active={tipo === "ajuste_negativo"}
              label="Salida"
              icon="remove-circle"
              onPress={() => setTipo("ajuste_negativo")}
            />
            <TipoBtn
              active={tipo === "merma"}
              label="Merma"
              icon="trash"
              onPress={() => setTipo("merma")}
            />
          </View>

          <Input
            label="Cantidad"
            icon="calculator"
            value={cantidad}
            onChangeText={setCantidad}
            placeholder="0"
            keyboardType="decimal-pad"
          />
          <View style={{ height: space.md }} />
          <Button
            label="Guardar ajuste"
            icon="save"
            busy={m.isPending}
            disabled={!cantidad || Number(cantidad) <= 0}
            onPress={() => m.mutate()}
          />
        </View>
      </View>
    </Modal>
  );
}

function TipoBtn({
  active,
  label,
  icon,
  onPress,
}: {
  active: boolean;
  label: string;
  icon: "add-circle" | "remove-circle" | "trash";
  onPress: () => void;
}) {
  return (
    <Pressable style={[s.tipoBtn, active && s.tipoBtnOn]} onPress={onPress}>
      <Icon name={icon} size={20} color={active ? colors.white : colors.brand} />
      <Text style={[s.tipoLabel, active && { color: colors.white }]}>{label}</Text>
    </Pressable>
  );
}

function fmt(n: string): string {
  const v = Number(n);
  return Number.isInteger(v) ? String(v) : v.toFixed(2);
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  filters: { flexDirection: "row", gap: space.sm, padding: space.lg, paddingBottom: space.sm },
  chip: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: radius.pill,
    backgroundColor: colors.card,
  },
  chipOn: { backgroundColor: colors.brand },
  chipText: { color: colors.text, fontWeight: "600" },
  chipTextOn: { color: colors.white },
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
  nombre: { fontWeight: "600", color: colors.ink, fontSize: 15 },
  sku: { color: colors.faint, fontSize: 12, marginTop: 2 },
  stockBox: { alignItems: "flex-end", gap: 3 },
  stock: { fontWeight: "800", color: colors.ink, fontSize: 17 },
  backdrop: { flex: 1, backgroundColor: "rgba(15,23,42,0.4)", justifyContent: "flex-end" },
  sheet: {
    backgroundColor: colors.card,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    padding: space.xl,
    gap: space.md,
  },
  sheetHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  sheetTitle: { fontSize: 18, fontWeight: "800", color: colors.ink, flex: 1 },
  sheetSub: { color: colors.muted, fontSize: 14 },
  tipoRow: { flexDirection: "row", gap: space.sm },
  tipoBtn: {
    flex: 1,
    alignItems: "center",
    gap: 4,
    paddingVertical: space.md,
    borderRadius: radius.md,
    backgroundColor: colors.brandLight,
  },
  tipoBtnOn: { backgroundColor: colors.brand },
  tipoLabel: { fontSize: 13, fontWeight: "700", color: colors.brandDark },
});
