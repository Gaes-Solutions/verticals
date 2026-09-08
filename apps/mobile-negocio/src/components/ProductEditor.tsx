import { useEffect, useRef, useState } from "react";
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  Switch,
  Text,
  View,
} from "react-native";
import { useAuth } from "../lib/auth-store";
import {
  type ProductDetail,
  type ProductDraft,
  canManageProducts,
  createProductBody,
  editablePrice,
  getProduct,
  listProducts,
  newProductDraft,
  productDraft,
  productFailure,
  saveProduct,
  updateProductBody,
} from "../services/productos";
import { colors, space } from "../theme";
import { Button, Input, Loading } from "../ui";

export function ProductEditor({
  id,
  onClose,
  onSaved,
}: { id: string | null; onClose: () => void; onSaved: () => void }) {
  const user = useAuth((state) => state.user);
  const canWrite = canManageProducts(
    user?.permissions ?? [],
    user?.isOwner ?? false,
    id ? "actualizar" : "crear",
  );
  const [current, setCurrent] = useState<ProductDetail | null>(null);
  const [draft, setDraft] = useState<ProductDraft>(newProductDraft);
  const [loading, setLoading] = useState(!!id);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [review, setReview] = useState(false);
  const writing = useRef(false);
  useEffect(() => {
    let active = true;
    if (id)
      void getProduct(id)
        .then((product) => {
          if (active) {
            setCurrent(product);
            setDraft(productDraft(product));
          }
        })
        .catch(() => {
          if (active) setError("No se pudo cargar el producto. Reintenta la consulta.");
        })
        .finally(() => {
          if (active) setLoading(false);
        });
    return () => {
      active = false;
    };
  }, [id]);
  const field = <K extends keyof ProductDraft>(name: K, value: ProductDraft[K]) =>
    setDraft((previous) => ({ ...previous, [name]: value }));
  async function save() {
    if (writing.current || !canWrite || review || (id && !current)) return;
    setError(null);
    try {
      if (current) updateProductBody(draft, current);
      else createProductBody(draft);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Revisa los campos.");
      return;
    }
    writing.current = true;
    setBusy(true);
    try {
      const saved = await saveProduct(draft, current);
      const checked = await getProduct(saved.id);
      if (
        checked.nombre !== draft.nombre.trim() ||
        (checked.descripcionCorta ?? "") !== draft.descripcionCorta.trim() ||
        ((!current || editablePrice(current)) &&
          Number(checked.variantes[0]?.precioBase) !== Number(draft.precioBase))
      )
        throw new Error("No se confirmó el contenido guardado.");
      onSaved();
    } catch (failure) {
      setReview(true);
      setError(productFailure(failure));
    } finally {
      writing.current = false;
      setBusy(false);
    }
  }
  async function verify() {
    if (writing.current) return;
    writing.current = true;
    setBusy(true);
    setError(null);
    try {
      if (id) {
        const product = await getProduct(id);
        setCurrent(product);
        setDraft(productDraft(product));
        setReview(false);
      } else {
        const result = await listProducts(draft.skuPadre, 1);
        const product = result.items.find((item) => item.skuPadre === draft.skuPadre.trim());
        setError(
          product
            ? `El SKU ya existe: ${product.nombre}. Cierra este formulario y revisa el producto en el catálogo; no repitas el alta.`
            : "Aún no se encontró el SKU. La solicitud anterior podría seguir en tránsito. Conserva el código y verifica el catálogo antes de otra alta.",
        );
      }
    } catch {
      setError("No se pudo consultar el estado. No repitas el guardado hasta verificarlo.");
    } finally {
      writing.current = false;
      setBusy(false);
    }
  }
  const enabled = canWrite && !busy && !review && (!id || !!current);
  return (
    <Modal
      visible
      animationType="slide"
      onRequestClose={() => {
        if (!busy) onClose();
      }}
    >
      <KeyboardAvoidingView
        style={{ flex: 1, backgroundColor: colors.bg }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          contentContainerStyle={{
            padding: space.lg,
            paddingTop: space.xl,
            gap: space.md,
            maxWidth: 680,
            width: "100%",
            alignSelf: "center",
          }}
          keyboardShouldPersistTaps="handled"
        >
          <Text style={{ fontSize: 24, fontWeight: "800", color: colors.ink }}>
            {id ? "Producto" : "Nuevo producto"}
          </Text>
          {loading ? (
            <Loading />
          ) : (
            <>
              <Text style={{ color: colors.text }}>
                {id
                  ? canWrite
                    ? "Edita la información básica. Los impuestos y variantes conservan su configuración."
                    : "Información de consulta. Tu cuenta no tiene permiso para modificar productos."
                  : "Alta de producto por pieza, con una sola variante. El inventario y la publicación se configuran por separado."}
              </Text>
              {error && (
                <Text accessibilityRole="alert" style={{ color: colors.danger }}>
                  {error}
                </Text>
              )}
              <Input
                label="Nombre"
                value={draft.nombre}
                onChangeText={(value) => field("nombre", value)}
                maxLength={240}
                editable={enabled}
              />
              <Input
                label="SKU / código interno"
                value={draft.skuPadre}
                onChangeText={(value) => field("skuPadre", value)}
                maxLength={60}
                editable={enabled && !id}
                autoCapitalize="none"
              />
              <Input
                label="Descripción corta"
                value={draft.descripcionCorta}
                onChangeText={(value) => field("descripcionCorta", value)}
                maxLength={500}
                editable={enabled}
                multiline
              />
              {!current || editablePrice(current) ? (
                <Input
                  label="Precio base de venta"
                  value={draft.precioBase}
                  onChangeText={(value) => field("precioBase", value)}
                  keyboardType="decimal-pad"
                  editable={enabled}
                />
              ) : (
                <Text style={{ color: colors.text }}>
                  Este producto tiene variantes. Sus precios se administran individualmente desde el
                  panel.
                </Text>
              )}
              {!id && (
                <>
                  <Input
                    label="Código de barras (opcional)"
                    value={draft.codigoBarras}
                    onChangeText={(value) => field("codigoBarras", value)}
                    maxLength={60}
                    editable={enabled}
                  />
                  <View
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      justifyContent: "space-between",
                    }}
                  >
                    <Text style={{ color: colors.text }}>Aplica IVA</Text>
                    <Switch
                      accessibilityLabel="Aplica IVA"
                      value={draft.aplicaIva}
                      onValueChange={(value) => field("aplicaIva", value)}
                      disabled={!enabled}
                    />
                  </View>
                  {draft.aplicaIva && (
                    <View style={{ gap: space.sm }}>
                      <Text style={{ color: colors.text }}>Tasa de IVA</Text>
                      {["0", "8", "16"].map((rate) => (
                        <Button
                          key={rate}
                          label={`${rate}%${draft.tasaIva === rate ? " · seleccionada" : ""}`}
                          variant={draft.tasaIva === rate ? "primary" : "outline"}
                          disabled={!enabled}
                          onPress={() => field("tasaIva", rate)}
                        />
                      ))}
                    </View>
                  )}
                </>
              )}
              {canWrite && (
                <Button
                  label={id ? "Guardar cambios" : "Crear producto"}
                  busy={busy}
                  disabled={!enabled}
                  onPress={() => void save()}
                />
              )}
              {(review || (id && !current)) && (
                <Button
                  label={id ? "Consultar y cargar datos guardados" : "Verificar SKU en catálogo"}
                  variant="outline"
                  busy={busy}
                  onPress={() => void verify()}
                />
              )}
            </>
          )}
          <Button label="Volver al catálogo" variant="ghost" disabled={busy} onPress={onClose} />
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
}
