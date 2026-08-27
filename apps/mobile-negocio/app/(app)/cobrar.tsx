import { money } from "@/lib/format";
import {
  type ProductoPOS,
  buscarProductosPOS,
  cobrarEfectivo,
  listSucursales,
  previewVenta,
} from "@/services/negocio";
import { colors, radius, shadow, space } from "@/theme";
import { Button, EmptyState, Icon, Input } from "@/ui";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";

interface Linea {
  varianteId: string;
  nombre: string;
  precio: number;
  cantidad: number;
}

export default function Cobrar() {
  const [q, setQ] = useState("");
  const [carrito, setCarrito] = useState<Linea[]>([]);

  const sucursales = useQuery({ queryKey: ["sucursales"], queryFn: listSucursales });
  const sucursalId = sucursales.data?.find((x) => x.isDefault)?.id ?? sucursales.data?.[0]?.id;

  const busqueda = useQuery({
    queryKey: ["pos-buscar", q],
    queryFn: () => buscarProductosPOS(q),
    enabled: q.trim().length > 0,
  });

  const lineas = useMemo(
    () => carrito.map((l) => ({ varianteId: l.varianteId, cantidad: String(l.cantidad) })),
    [carrito],
  );

  const preview = useQuery({
    queryKey: ["pos-preview", sucursalId, JSON.stringify(lineas)],
    queryFn: () => previewVenta(sucursalId as string, lineas),
    enabled: !!sucursalId && lineas.length > 0,
  });

  const cobrar = useMutation({
    mutationFn: () =>
      cobrarEfectivo(sucursalId as string, lineas, preview.data?.total ?? sumaLocal(carrito)),
    onSuccess: (v) => {
      setCarrito([]);
      setQ("");
      Alert.alert("Venta cobrada ✓", `Folio ${v.folio} · ${money(v.total)}`);
    },
    onError: (e) => Alert.alert("No se pudo cobrar", e instanceof Error ? e.message : "Error"),
  });

  const add = (p: ProductoPOS) => {
    const v = p.variantes.find((x) => x.isDefault) ?? p.variantes[0];
    if (!v) return;
    setCarrito((c) => {
      const i = c.findIndex((l) => l.varianteId === v.id);
      if (i >= 0) {
        const copy = [...c];
        copy[i] = { ...copy[i], cantidad: copy[i].cantidad + 1 } as Linea;
        return copy;
      }
      return [
        ...c,
        { varianteId: v.id, nombre: p.nombre, precio: Number(v.precioBase), cantidad: 1 },
      ];
    });
  };

  const setCant = (varianteId: string, delta: number) =>
    setCarrito((c) =>
      c
        .map((l) => (l.varianteId === varianteId ? { ...l, cantidad: l.cantidad + delta } : l))
        .filter((l) => l.cantidad > 0),
    );

  const total = preview.data ? money(preview.data.total) : money(sumaLocal(carrito));

  return (
    <View style={s.root}>
      <View style={s.searchBox}>
        <Input
          icon="search"
          value={q}
          onChangeText={setQ}
          placeholder="Buscar producto o código…"
          autoCorrect={false}
          autoCapitalize="none"
        />
      </View>

      {q.trim().length > 0 ? (
        <View style={s.results}>
          {busqueda.isLoading ? (
            <ActivityIndicator color={colors.brand} style={{ padding: space.md }} />
          ) : (
            <FlatList
              keyboardShouldPersistTaps="handled"
              data={busqueda.data?.items ?? []}
              keyExtractor={(p) => p.id}
              style={{ maxHeight: 220 }}
              ListEmptyComponent={<Text style={s.noRes}>Sin resultados.</Text>}
              renderItem={({ item }) => {
                const v = item.variantes.find((x) => x.isDefault) ?? item.variantes[0];
                return (
                  <Pressable style={s.resRow} onPress={() => add(item)}>
                    <View style={{ flex: 1 }}>
                      <Text style={s.resName} numberOfLines={1}>
                        {item.nombre}
                      </Text>
                      <Text style={s.resSku}>{item.skuPadre}</Text>
                    </View>
                    <Text style={s.resPrice}>{money(v?.precioBase ?? "0")}</Text>
                    <Icon name="add-circle" size={24} color={colors.brand} />
                  </Pressable>
                );
              }}
            />
          )}
        </View>
      ) : null}

      <FlatList
        contentContainerStyle={s.cartList}
        data={carrito}
        keyExtractor={(l) => l.varianteId}
        ListEmptyComponent={
          <EmptyState
            icon="cart-outline"
            title="Carrito vacío"
            subtitle="Busca productos arriba y tócalos para agregarlos."
          />
        }
        renderItem={({ item }) => (
          <View style={s.line}>
            <View style={{ flex: 1 }}>
              <Text style={s.lineName} numberOfLines={1}>
                {item.nombre}
              </Text>
              <Text style={s.linePrice}>{money(item.precio)} c/u</Text>
            </View>
            <View style={s.stepper}>
              <Pressable style={s.step} onPress={() => setCant(item.varianteId, -1)}>
                <Icon name="remove" size={18} color={colors.brand} />
              </Pressable>
              <Text style={s.cant}>{item.cantidad}</Text>
              <Pressable style={s.step} onPress={() => setCant(item.varianteId, 1)}>
                <Icon name="add" size={18} color={colors.brand} />
              </Pressable>
            </View>
            <Text style={s.lineTotal}>{money(item.precio * item.cantidad)}</Text>
          </View>
        )}
      />

      {carrito.length > 0 ? (
        <View style={s.footer}>
          <View style={s.totalRow}>
            <Text style={s.totalLabel}>Total {preview.isFetching ? "…" : ""}</Text>
            <Text style={s.totalVal}>{total}</Text>
          </View>
          <Button
            label="Cobrar en efectivo"
            icon="cash"
            busy={cobrar.isPending}
            disabled={!sucursalId}
            onPress={() => cobrar.mutate()}
          />
        </View>
      ) : null}
    </View>
  );
}

function sumaLocal(c: Linea[]): string {
  return c.reduce((a, l) => a + l.precio * l.cantidad, 0).toFixed(2);
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  searchBox: { padding: space.lg, paddingBottom: space.sm },
  results: {
    marginHorizontal: space.lg,
    backgroundColor: colors.card,
    borderRadius: radius.md,
    ...shadow.card,
    overflow: "hidden",
  },
  noRes: { padding: space.md, color: colors.faint, textAlign: "center" },
  resRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    padding: space.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
  },
  resName: { fontWeight: "600", color: colors.ink, fontSize: 15 },
  resSku: { color: colors.faint, fontSize: 12 },
  resPrice: { fontWeight: "700", color: colors.text },
  cartList: { padding: space.lg, gap: space.sm, flexGrow: 1 },
  line: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    backgroundColor: colors.card,
    borderRadius: radius.md,
    padding: space.md,
    ...shadow.card,
  },
  lineName: { fontWeight: "600", color: colors.ink, fontSize: 15 },
  linePrice: { color: colors.muted, fontSize: 12 },
  stepper: { flexDirection: "row", alignItems: "center", gap: space.sm },
  step: {
    width: 30,
    height: 30,
    borderRadius: radius.sm,
    backgroundColor: colors.brandLight,
    alignItems: "center",
    justifyContent: "center",
  },
  cant: { minWidth: 22, textAlign: "center", fontWeight: "700", color: colors.ink },
  lineTotal: { minWidth: 66, textAlign: "right", fontWeight: "800", color: colors.ink },
  footer: {
    padding: space.lg,
    backgroundColor: colors.card,
    borderTopWidth: 1,
    borderTopColor: colors.line,
    gap: space.md,
  },
  totalRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  totalLabel: { fontSize: 16, color: colors.muted, fontWeight: "600" },
  totalVal: { fontSize: 26, fontWeight: "800", color: colors.ink },
});
