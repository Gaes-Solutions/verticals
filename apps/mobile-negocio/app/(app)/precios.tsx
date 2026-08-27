import { money } from "@/lib/format";
import {
  type TipoLista,
  crearListaPrecios,
  getListaPrecios,
  listListasPrecios,
} from "@/services/negocio";
import { colors, radius, shadow, space } from "@/theme";
import { Button, EmptyState, Icon, Input, Loading } from "@/ui";
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

const TIPO_LABEL: Record<string, string> = {
  publico: "Público",
  mayoreo_nivel: "Mayoreo (por nivel)",
  cliente_individual: "Cliente específico",
};
const TIPOS: TipoLista[] = ["publico", "mayoreo_nivel", "cliente_individual"];

export default function Precios() {
  const qc = useQueryClient();
  const [detId, setDetId] = useState<string | null>(null);
  const [nueva, setNueva] = useState(false);
  const q = useQuery({ queryKey: ["listas-precios"], queryFn: listListasPrecios });

  return (
    <View style={s.root}>
      {q.isLoading ? (
        <Loading />
      ) : (
        <FlatList
          contentContainerStyle={s.list}
          data={q.data ?? []}
          keyExtractor={(l) => l.id}
          refreshing={q.isFetching}
          onRefresh={() => q.refetch()}
          ListHeaderComponent={
            <Pressable style={s.nuevaBtn} onPress={() => setNueva(true)}>
              <Icon name="add-circle" size={22} color={colors.brand} />
              <Text style={s.nuevaText}>Nueva lista de precios</Text>
            </Pressable>
          }
          ListEmptyComponent={<EmptyState icon="cash-outline" title="Sin listas de precios" />}
          renderItem={({ item }) => (
            <Pressable style={s.card} onPress={() => setDetId(item.id)}>
              <View style={s.thumb}>
                <Icon name="pricetag" size={20} color={colors.brand} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.nombre}>{item.nombre}</Text>
                <Text style={s.meta}>
                  {item.codigo} · {TIPO_LABEL[item.tipo] ?? item.tipo} · {item._count?.items ?? 0}{" "}
                  productos
                </Text>
              </View>
              <Icon name="chevron-forward" size={20} color={colors.faint} />
            </Pressable>
          )}
        />
      )}

      <DetalleModal id={detId} onClose={() => setDetId(null)} tipoLabel={TIPO_LABEL} />
      <NuevaModal
        visible={nueva}
        onClose={() => setNueva(false)}
        onDone={() => {
          setNueva(false);
          void qc.invalidateQueries({ queryKey: ["listas-precios"] });
        }}
      />
    </View>
  );
}

function DetalleModal({
  id,
  onClose,
  tipoLabel,
}: { id: string | null; onClose: () => void; tipoLabel: Record<string, string> }) {
  const det = useQuery({
    queryKey: ["lista", id],
    queryFn: () => getListaPrecios(id as string),
    enabled: !!id,
  });
  const l = det.data;
  return (
    <Modal visible={!!id} animationType="slide" onRequestClose={onClose}>
      <View style={s.modalRoot}>
        <View style={s.modalHead}>
          <Text style={s.modalTitle}>{l?.nombre ?? "Lista"}</Text>
          <Pressable onPress={onClose}>
            <Icon name="close" size={26} color={colors.muted} />
          </Pressable>
        </View>
        {det.isLoading || !l ? (
          <Loading />
        ) : (
          <FlatList
            contentContainerStyle={s.modalBody}
            data={l.items}
            keyExtractor={(it) => it.varianteId}
            ListHeaderComponent={
              <Text style={s.detMeta}>
                {l.codigo} · {tipoLabel[l.tipo] ?? l.tipo}
              </Text>
            }
            ListEmptyComponent={
              <EmptyState
                icon="cube-outline"
                title="Sin productos"
                subtitle="Esta lista no tiene precios asignados."
              />
            }
            renderItem={({ item }) => (
              <View style={s.itemRow}>
                <Text style={s.itemSku}>{item.variante.sku}</Text>
                <Text style={s.itemPrecio}>{money(item.precio)}</Text>
              </View>
            )}
          />
        )}
      </View>
    </Modal>
  );
}

function NuevaModal({
  visible,
  onClose,
  onDone,
}: { visible: boolean; onClose: () => void; onDone: () => void }) {
  const [codigo, setCodigo] = useState("");
  const [nombre, setNombre] = useState("");
  const [tipo, setTipo] = useState<TipoLista>("publico");
  const m = useMutation({
    mutationFn: () => crearListaPrecios({ codigo: codigo.trim(), nombre: nombre.trim(), tipo }),
    onSuccess: () => {
      setCodigo("");
      setNombre("");
      onDone();
    },
    onError: (e) => Alert.alert("No se pudo crear", e instanceof Error ? e.message : "Error"),
  });
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={s.backdrop}>
        <ScrollView style={s.sheet} contentContainerStyle={{ gap: space.md }}>
          <Text style={s.sheetTitle}>Nueva lista de precios</Text>
          <Input
            label="Código"
            icon="barcode"
            value={codigo}
            onChangeText={setCodigo}
            placeholder="LISTA-01"
            autoCapitalize="characters"
          />
          <Input
            label="Nombre"
            icon="pricetag"
            value={nombre}
            onChangeText={setNombre}
            placeholder="Mayoreo"
          />
          <Text style={s.sheetLabel}>Tipo</Text>
          <View style={s.tipos}>
            {TIPOS.map((t) => (
              <Pressable
                key={t}
                style={[s.tipo, tipo === t && s.tipoOn]}
                onPress={() => setTipo(t)}
              >
                <Text style={[s.tipoText, tipo === t && s.tipoTextOn]}>{TIPO_LABEL[t]}</Text>
              </Pressable>
            ))}
          </View>
          <Button
            label="Crear lista"
            icon="save"
            busy={m.isPending}
            disabled={!codigo.trim() || !nombre.trim()}
            onPress={() => m.mutate()}
          />
          <Button label="Cancelar" variant="ghost" onPress={onClose} />
        </ScrollView>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  list: { padding: space.lg, gap: space.sm },
  nuevaBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: space.sm,
    backgroundColor: colors.card,
    borderRadius: radius.md,
    paddingVertical: space.md,
    marginBottom: space.sm,
    ...shadow.card,
  },
  nuevaText: { color: colors.brand, fontWeight: "700", fontSize: 15 },
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.md,
    padding: space.md,
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    ...shadow.card,
  },
  thumb: {
    width: 40,
    height: 40,
    borderRadius: radius.sm,
    backgroundColor: colors.brandLight,
    alignItems: "center",
    justifyContent: "center",
  },
  nombre: { fontWeight: "700", color: colors.ink, fontSize: 15 },
  meta: { color: colors.muted, fontSize: 12, marginTop: 2 },
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
  detMeta: { color: colors.muted, fontSize: 13, marginBottom: space.sm },
  itemRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: colors.card,
    borderRadius: radius.md,
    padding: space.md,
    ...shadow.card,
  },
  itemSku: { color: colors.text, fontSize: 14, fontWeight: "600" },
  itemPrecio: { color: colors.ink, fontWeight: "800", fontSize: 15 },
  backdrop: { flex: 1, backgroundColor: "rgba(15,23,42,0.4)", justifyContent: "flex-end" },
  sheet: {
    backgroundColor: colors.card,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    padding: space.xl,
    maxHeight: "85%",
  },
  sheetTitle: { fontSize: 18, fontWeight: "800", color: colors.ink },
  sheetLabel: { fontSize: 13, fontWeight: "600", color: colors.text },
  tipos: { gap: space.sm },
  tipo: {
    paddingVertical: 12,
    paddingHorizontal: space.md,
    borderRadius: radius.md,
    backgroundColor: colors.bg,
    borderWidth: 1,
    borderColor: colors.line,
  },
  tipoOn: { backgroundColor: colors.brandLight, borderColor: colors.brand },
  tipoText: { color: colors.text, fontWeight: "600" },
  tipoTextOn: { color: colors.brandDark },
});
