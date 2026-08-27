import { fecha, money } from "@/lib/format";
import {
  type CfdiRecibido,
  autoCategorizarCfdi,
  categorizarCfdi,
  getDiot,
  listCategoriasContables,
  listCfdisRecibidos,
} from "@/services/negocio";
import { colors, radius, shadow, space } from "@/theme";
import { Badge, Card, EmptyState, Icon, Loading, StatCard } from "@/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Alert, FlatList, Modal, Pressable, StyleSheet, Text, View } from "react-native";

export default function Contabilidad() {
  const qc = useQueryClient();
  const [sel, setSel] = useState<CfdiRecibido | null>(null);
  const recibidos = useQuery({ queryKey: ["cfdis-recibidos"], queryFn: listCfdisRecibidos });

  // periodo del CFDI más reciente (YYYYMM), para el DIOT.
  const periodo = recibidos.data?.items?.[0]?.fechaEmision?.slice(0, 7).replace("-", "") ?? "";
  const diot = useQuery({
    queryKey: ["diot", periodo],
    queryFn: () => getDiot(periodo),
    enabled: periodo.length === 6,
  });

  const auto = useMutation({
    mutationFn: (id: string) => autoCategorizarCfdi(id),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["cfdis-recibidos"] }),
    onError: (e) => Alert.alert("No se pudo", e instanceof Error ? e.message : "Error"),
  });

  if (recibidos.isLoading) return <Loading />;

  return (
    <View style={s.root}>
      <FlatList
        contentContainerStyle={s.list}
        data={recibidos.data?.items ?? []}
        keyExtractor={(c) => c.id}
        refreshing={recibidos.isFetching}
        onRefresh={() => recibidos.refetch()}
        ListHeaderComponent={
          diot.data ? (
            <Card style={{ marginBottom: space.sm }}>
              <Text style={s.cardTitle}>DIOT · {diot.data.periodoYyyymm}</Text>
              <View style={s.grid}>
                <StatCard
                  label="Proveedores"
                  value={String(diot.data.totalProveedores)}
                  icon="business"
                />
                <StatCard
                  label="IVA pagado"
                  value={money(diot.data.totalIvaPagado)}
                  icon="calculator"
                  highlight
                />
              </View>
            </Card>
          ) : null
        }
        ListEmptyComponent={
          <EmptyState
            icon="documents-outline"
            title="Sin CFDIs recibidos"
            subtitle="Aquí verás las facturas de tus proveedores."
          />
        }
        renderItem={({ item }) => {
          const cat = item.categorizacion?.categoria;
          return (
            <View style={s.card}>
              <View style={s.top}>
                <Text style={s.emisor} numberOfLines={1}>
                  {item.emisorRazonSocial}
                </Text>
                <Text style={s.total}>{money(item.total)}</Text>
              </View>
              <Text style={s.meta}>
                {item.emisorRfc} · {fecha(item.fechaEmision)}
              </Text>
              <View style={s.catRow}>
                {cat ? (
                  <Badge label={cat.nombre} tone="ok" />
                ) : (
                  <Badge label="Sin categorizar" tone="warn" />
                )}
                <View style={{ flexDirection: "row", gap: space.sm }}>
                  <Pressable style={s.miniBtn} onPress={() => auto.mutate(item.id)}>
                    <Icon name="sparkles" size={14} color={colors.brand} />
                    <Text style={s.miniText}>Auto</Text>
                  </Pressable>
                  <Pressable style={s.miniBtn} onPress={() => setSel(item)}>
                    <Icon name="pricetag" size={14} color={colors.brand} />
                    <Text style={s.miniText}>Categoría</Text>
                  </Pressable>
                </View>
              </View>
            </View>
          );
        }}
      />

      <CategorizarModal
        cfdi={sel}
        onClose={() => setSel(null)}
        onDone={() => {
          setSel(null);
          void qc.invalidateQueries({ queryKey: ["cfdis-recibidos"] });
        }}
      />
    </View>
  );
}

function CategorizarModal({
  cfdi,
  onClose,
  onDone,
}: { cfdi: CfdiRecibido | null; onClose: () => void; onDone: () => void }) {
  const cats = useQuery({
    queryKey: ["categorias-contables"],
    queryFn: listCategoriasContables,
    enabled: !!cfdi,
  });
  const m = useMutation({
    mutationFn: (categoriaId: string) => categorizarCfdi(cfdi?.id ?? "", categoriaId),
    onSuccess: onDone,
    onError: (e) => Alert.alert("No se pudo", e instanceof Error ? e.message : "Error"),
  });
  return (
    <Modal visible={!!cfdi} animationType="slide" onRequestClose={onClose}>
      <View style={s.modalRoot}>
        <View style={s.modalHead}>
          <Text style={s.modalTitle}>Categoría contable</Text>
          <Pressable onPress={onClose}>
            <Icon name="close" size={26} color={colors.muted} />
          </Pressable>
        </View>
        {cats.isLoading ? (
          <Loading />
        ) : (
          <FlatList
            contentContainerStyle={s.catList}
            data={cats.data ?? []}
            keyExtractor={(c) => c.id}
            ListEmptyComponent={<EmptyState icon="pricetags-outline" title="Sin categorías" />}
            renderItem={({ item }) => (
              <Pressable style={s.catItem} onPress={() => m.mutate(item.id)} disabled={m.isPending}>
                <View style={{ flex: 1 }}>
                  <Text style={s.catName}>{item.nombre}</Text>
                  <Text style={s.catCode}>
                    {item.codigoContable} · {item.tipo}
                  </Text>
                </View>
                <Icon name="chevron-forward" size={20} color={colors.faint} />
              </Pressable>
            )}
          />
        )}
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  list: { padding: space.lg, gap: space.sm },
  cardTitle: { fontSize: 15, fontWeight: "800", color: colors.ink, marginBottom: space.sm },
  grid: { flexDirection: "row", gap: space.sm },
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.md,
    padding: space.md,
    gap: 6,
    ...shadow.card,
  },
  top: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: space.sm,
  },
  emisor: { fontWeight: "700", color: colors.ink, fontSize: 15, flex: 1 },
  total: { fontWeight: "800", color: colors.ink, fontSize: 16 },
  meta: { color: colors.muted, fontSize: 12 },
  catRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: space.sm,
  },
  miniBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: colors.brandLight,
    borderRadius: radius.sm,
    paddingVertical: 6,
    paddingHorizontal: 10,
  },
  miniText: { color: colors.brand, fontWeight: "700", fontSize: 12 },
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
  catList: { padding: space.lg, gap: space.sm },
  catItem: {
    backgroundColor: colors.card,
    borderRadius: radius.md,
    padding: space.md,
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    ...shadow.card,
  },
  catName: { fontWeight: "600", color: colors.ink, fontSize: 15 },
  catCode: { color: colors.faint, fontSize: 12, marginTop: 2 },
});
