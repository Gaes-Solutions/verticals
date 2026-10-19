import { type CatalogAction, type CatalogState, catalogOrders } from "@/lib/catalog-state";
import type { StoreCategory } from "@/services/comercio";
import { colors, commerce } from "@/theme";
import type { Dispatch } from "react";
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Button } from "./Button";
import { CommerceError } from "./CommerceError";
import { Icon } from "./Icon";
import { Loading } from "./Loading";

export function CatalogFilters({
  state,
  dispatch,
  categories,
  loading,
  error,
  retry,
}: {
  state: CatalogState;
  dispatch: Dispatch<CatalogAction>;
  categories: StoreCategory[];
  loading: boolean;
  error: unknown;
  retry: () => void;
}) {
  const draft = state.draft;
  const edit = (value: Partial<typeof draft>) => dispatch({ type: "edit", value });
  return (
    <Modal
      visible={state.open}
      transparent
      animationType="slide"
      onRequestClose={() => dispatch({ type: "close" })}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={s.scrim}
      >
        <Pressable
          style={StyleSheet.absoluteFill}
          accessibilityRole="button"
          accessibilityLabel="Cerrar filtros sin aplicar"
          onPress={() => dispatch({ type: "close" })}
        />
        <SafeAreaView edges={["bottom"]} style={s.sheet} accessibilityViewIsModal>
          <View style={s.header}>
            <View style={{ flex: 1 }}>
              <Text style={s.eyebrow}>ENCUENTRA LO QUE TE GUSTA</Text>
              <Text accessibilityRole="header" style={s.title}>
                Filtrar y ordenar
              </Text>
            </View>
            <Pressable
              style={s.close}
              accessibilityRole="button"
              accessibilityLabel="Cerrar filtros"
              onPress={() => dispatch({ type: "close" })}
            >
              <Icon name="close" size={24} color={commerce.forest} />
            </Pressable>
          </View>
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={s.content}>
            <Text accessibilityRole="header" style={s.section}>
              Categoría
            </Text>
            {loading ? <Loading /> : null}
            {error ? (
              <CommerceError
                error={error}
                retry={retry}
                message="No pudimos cargar las categorías. Puedes reintentar o usar los demás filtros."
              />
            ) : null}
            <View style={s.chips}>
              {[{ id: "", nombre: "Todas", slugSeo: "" }, ...categories].map((category) => {
                const selected = draft.categoriaPublicaId === category.id;
                return (
                  <Pressable
                    key={category.id}
                    accessibilityRole="radio"
                    accessibilityState={{ checked: selected }}
                    accessibilityLabel={`Categoría: ${category.nombre}`}
                    onPress={() => edit({ categoriaPublicaId: category.id })}
                    style={[s.chip, selected && s.selected]}
                  >
                    <Text style={[s.chipText, selected && s.selectedText]}>{category.nombre}</Text>
                  </Pressable>
                );
              })}
            </View>
            <Text accessibilityRole="header" style={s.section}>
              Precio por artículo
            </Text>
            <Text style={s.hint}>Importes en pesos. Puedes indicar solo un límite.</Text>
            <View style={s.prices}>
              <View style={s.price}>
                <Text style={s.label}>Desde</Text>
                <TextInput
                  accessibilityLabel="Precio mínimo"
                  value={draft.precioMin}
                  onChangeText={(precioMin) => edit({ precioMin })}
                  keyboardType="decimal-pad"
                  maxLength={13}
                  placeholder="Sin mínimo"
                  placeholderTextColor={colors.muted}
                  style={s.input}
                />
              </View>
              <View style={s.price}>
                <Text style={s.label}>Hasta</Text>
                <TextInput
                  accessibilityLabel="Precio máximo"
                  value={draft.precioMax}
                  onChangeText={(precioMax) => edit({ precioMax })}
                  keyboardType="decimal-pad"
                  maxLength={13}
                  placeholder="Sin máximo"
                  placeholderTextColor={colors.muted}
                  style={s.input}
                />
              </View>
            </View>
            <View style={s.switchRow}>
              <View style={{ flex: 1 }}>
                <Text style={s.label}>Solo ofertas</Text>
                <Text style={s.hint}>Precios con promoción activa</Text>
              </View>
              <Switch
                testID="catalog-filter-offers"
                accessibilityLabel="Solo ofertas"
                value={draft.soloOfertas}
                onValueChange={(soloOfertas) => edit({ soloOfertas })}
                trackColor={{ true: commerce.forest }}
                hitSlop={8}
              />
            </View>
            <View style={s.switchRow}>
              <View style={{ flex: 1 }}>
                <Text style={s.label}>Solo disponibles</Text>
                <Text style={s.hint}>Artículos con inventario público</Text>
              </View>
              <Switch
                testID="catalog-filter-in-stock"
                accessibilityLabel="Solo disponibles"
                value={draft.soloDisponibles}
                onValueChange={(soloDisponibles) => edit({ soloDisponibles })}
                trackColor={{ true: commerce.forest }}
                hitSlop={8}
              />
            </View>
            <Text accessibilityRole="header" style={s.section}>
              Ordenar por
            </Text>
            {catalogOrders.map((order) => {
              const selected = draft.orden === order.value;
              return (
                <Pressable
                  key={order.value}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: selected }}
                  accessibilityLabel={`Orden: ${order.label}`}
                  onPress={() => edit({ orden: order.value })}
                  style={[s.order, selected && s.orderSelected]}
                >
                  <Text
                    style={[s.orderText, selected && { color: commerce.forest, fontWeight: "700" }]}
                  >
                    {order.label}
                  </Text>
                  <Icon
                    name={selected ? "radio-button-on" : "radio-button-off"}
                    color={selected ? commerce.forest : colors.muted}
                    size={22}
                  />
                </Pressable>
              );
            })}
          </ScrollView>
          {state.error ? (
            <Text accessibilityRole="alert" accessibilityLiveRegion="polite" style={s.error}>
              {state.error}
            </Text>
          ) : null}
          <View style={s.footer}>
            <View style={{ flex: 1 }}>
              <Button
                testID="catalog-filter-clear"
                label="Quitar filtros"
                variant="outline"
                onPress={() => dispatch({ type: "clearFilters" })}
              />
            </View>
            <View style={{ flex: 1 }}>
              <Button
                testID="catalog-filter-apply"
                label="Aplicar filtros"
                onPress={() => dispatch({ type: "apply" })}
              />
            </View>
          </View>
        </SafeAreaView>
      </KeyboardAvoidingView>
    </Modal>
  );
}
const s = StyleSheet.create({
  scrim: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(13,36,27,0.45)" },
  sheet: {
    maxHeight: "92%",
    width: "100%",
    maxWidth: 680,
    alignSelf: "center",
    backgroundColor: colors.card,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 20,
    borderBottomWidth: 1,
    borderColor: "#e3e8e2",
  },
  eyebrow: { fontSize: 9, letterSpacing: 1.3, color: colors.muted, marginBottom: 5 },
  title: { fontSize: 22, fontWeight: "800", color: commerce.forest },
  close: {
    minHeight: 44,
    minWidth: 44,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 22,
    backgroundColor: "#f1f4f1",
  },
  content: { padding: 20, paddingTop: 4, paddingBottom: 24 },
  section: { fontSize: 17, fontWeight: "800", color: colors.ink, marginTop: 20, marginBottom: 10 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: {
    minHeight: 44,
    maxWidth: "100%",
    paddingHorizontal: 14,
    paddingVertical: 11,
    borderWidth: 1,
    borderColor: "#d9e1da",
    borderRadius: 22,
    justifyContent: "center",
  },
  chipText: { fontSize: 13, color: colors.text },
  selected: { backgroundColor: commerce.forest, borderColor: commerce.forest },
  selectedText: { color: colors.white, fontWeight: "700" },
  hint: { fontSize: 12, lineHeight: 18, color: colors.muted },
  label: { fontSize: 14, fontWeight: "600", color: colors.ink, marginBottom: 5 },
  prices: { flexDirection: "row", gap: 12, marginTop: 12 },
  price: { flex: 1 },
  input: {
    minHeight: 48,
    borderWidth: 1,
    borderColor: "#d9e1da",
    borderRadius: 12,
    padding: 12,
    fontSize: 16,
    color: colors.ink,
    backgroundColor: "#fafbf9",
  },
  switchRow: {
    minHeight: 64,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderColor: "#edf0ec",
  },
  order: {
    minHeight: 48,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderRadius: 12,
    marginBottom: 4,
  },
  orderSelected: { backgroundColor: "#edf4ee" },
  orderText: { flex: 1, fontSize: 14, color: colors.text },
  error: { paddingHorizontal: 20, paddingTop: 12, color: colors.danger, fontSize: 13 },
  footer: { flexDirection: "row", gap: 12, padding: 16, borderTopWidth: 1, borderColor: "#e3e8e2" },
});
