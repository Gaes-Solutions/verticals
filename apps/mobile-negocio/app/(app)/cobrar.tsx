import { useAuth } from "@/lib/auth-store";
import {
  calcularEfectivo,
  consultarCobroPendiente,
  totalVerificado,
  validarAntesDeCobrar,
} from "@/lib/cobro-model";
import { type OpcionCobro, agregarOpcion, opcionesCobro } from "@/lib/cobro-productos";
import { type Recuperacion, iniciarCobro, recuperarCobro } from "@/lib/cobro-recovery";
import { money } from "@/lib/format";
import { secureStorage } from "@/lib/storage";
import {
  buscarProductosPOS,
  cancelarIntentoCobro,
  consultarIntentoCobro,
  enviarCobroDurable,
  listCajasPOS,
  listSucursales,
  prepararCobro,
  previewVenta,
  verificarAperturaPOS,
} from "@/services/negocio";
import { colors, radius, shadow, space } from "@/theme";
import { Button, EmptyState, Icon, Input } from "@/ui";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  ScrollView,
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
const cobroApi = {
  preparar: prepararCobro,
  enviar: enviarCobroDurable,
  consultar: consultarIntentoCobro,
  cancelar: cancelarIntentoCobro,
};
const ownerActual = () => {
  const auth = useAuth.getState();
  return auth.status === "signedIn" ? JSON.stringify([auth.tenantSlug, auth.user?.id]) : "";
};
export default function Cobrar() {
  const { user, tenantSlug, status } = useAuth();
  const can = (permission: string) =>
    user?.isOwner === true ||
    user?.permissions.includes("*") === true ||
    user?.permissions.includes(permission) === true;
  const owner = JSON.stringify([tenantSlug, user?.id]);
  if (status !== "signedIn" || !can("ventas.crear"))
    return <Text style={s.noRes}>No tienes permiso para crear ventas.</Text>;
  if (!["sucursales.leer", "cajas.leer", "corte.consultar"].every(can))
    return (
      <Text style={s.noRes}>
        Necesitas permiso para consultar sucursales, cajas y aperturas. Solicítalo al encargado.
      </Text>
    );
  return <Cobro key={owner} owner={owner} />;
}
function useCobro(owner: string) {
  const [q, setQ] = useState("");
  const [carrito, setCarrito] = useState<Linea[]>([]);
  const [sucursalId, setSucursalId] = useState("");
  const [cajaId, setCajaId] = useState("");
  const [busy, setBusy] = useState(false);
  const [incierto, setIncierto] = useState(false);
  const [recovery, setRecovery] = useState<Recuperacion | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [recibido, setRecibido] = useState("");
  const guard = useRef(false);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  const current = () => alive.current && ownerActual() === owner;
  const pending = useQuery({
    queryKey: ["pos-pending", owner],
    queryFn: () => consultarCobroPendiente(owner, secureStorage),
    retry: false,
  });
  const blockedPending = pending.isFetching || pending.isError || pending.data !== false;
  const locked = busy || incierto || blockedPending;
  const sucursales = useQuery({
    queryKey: ["sucursales", owner],
    queryFn: listSucursales,
    retry: false,
  });
  const cajas = useQuery({
    queryKey: ["pos-cajas", owner, sucursalId],
    queryFn: () => listCajasPOS(sucursalId),
    enabled: !!sucursalId,
    retry: false,
  });
  const apertura = useQuery({
    queryKey: ["pos-apertura", owner, sucursalId, cajaId],
    queryFn: () => verificarAperturaPOS(sucursalId, cajaId),
    enabled: !!sucursalId && !!cajaId,
    retry: false,
  });
  const busqueda = useQuery({
    queryKey: ["pos-buscar", owner, q],
    queryFn: () => buscarProductosPOS(q),
    enabled: q.trim().length > 0 && !locked,
    retry: false,
  });
  const lineas = useMemo(
    () => carrito.map((l) => ({ varianteId: l.varianteId, cantidad: String(l.cantidad) })),
    [carrito],
  );
  const preview = useQuery({
    queryKey: ["pos-preview", owner, sucursalId, JSON.stringify(lineas)],
    queryFn: () => previewVenta(sucursalId, lineas),
    enabled: !!sucursalId && lineas.length > 0 && !locked,
    retry: false,
  });
  const efectivo =
    !preview.isFetching && !preview.isError
      ? calcularEfectivo(preview.data?.total, recibido)
      : null;
  const ready =
    !sucursales.isFetching &&
    !sucursales.isError &&
    !cajas.isFetching &&
    !cajas.isError &&
    !!sucursalId &&
    !!cajaId &&
    apertura.data === true &&
    !apertura.isFetching &&
    !apertura.isError &&
    !preview.isFetching &&
    !preview.isError &&
    totalVerificado(preview.data?.total) &&
    carrito.length > 0 &&
    efectivo !== null &&
    !locked;
  async function cobrar() {
    if (guard.current || !ready || !current()) return;
    guard.current = true;
    setBusy(true);
    setError("");
    setNotice("");
    const result = await iniciarCobro(
      owner,
      { sucursalId, cajaId, lineas, recibido },
      {
        api: cobroApi,
        storage: secureStorage,
        validar: () =>
          validarAntesDeCobrar(
            { sucursalId, cajaId, total: preview.data?.total ?? "", lineas },
            {
              branches: listSucursales,
              registers: listCajasPOS,
              opening: verificarAperturaPOS,
              preview: previewVenta,
            },
          ),
        vigente: current,
      },
    );
    guard.current = false;
    if (!current()) return;
    setBusy(false);
    aplicarResultado(result);
  }
  function aplicarResultado(result: Recuperacion) {
    setRecovery(result);
    if (result.estado === "confirmado") {
      setIncierto(false);
      setError("");
      setCarrito([]);
      setRecibido("");
      setQ("");
      void pending.refetch();
      setNotice(
        `Venta confirmada · Folio ${result.venta.folio} · Total ${money(result.venta.total)} · Recibido ${money(result.venta.totalCobrado)} · Cambio ${money(result.venta.cambioDado)}`,
      );
      Alert.alert(
        "Venta confirmada",
        `Folio ${result.venta.folio} · Total ${money(result.venta.total)} · Recibido ${money(result.venta.totalCobrado)} · Cambio ${money(result.venta.cambioDado)}`,
      );
    } else if (result.estado === "anulado") {
      setIncierto(false);
      setError("");
      setRecibido("");
      setNotice(
        "Intento cancelado sin registrar una venta. Revisa el efectivo recibido y la nueva cotización antes de cobrar.",
      );
      void pending.refetch();
      void preview.refetch();
    } else if (result.estado === "rechazado") setError(result.mensaje);
    else if (result.estado === "ninguno") {
      setIncierto(false);
      void pending.refetch();
    } else if (result.estado !== "cancelado") {
      setIncierto(true);
      void pending.refetch();
    }
  }
  async function recuperar(accion: "consultar" | "reenviar" | "cancelar" = "consultar") {
    if (guard.current || !current()) return;
    guard.current = true;
    setBusy(true);
    const result = await recuperarCobro(owner, secureStorage, cobroApi, current, accion);
    guard.current = false;
    if (!current()) return;
    setBusy(false);
    aplicarResultado(result);
  }

  const add = (option: OpcionCobro) => {
    if (locked || guard.current) return;
    setNotice("");
    setCarrito((items) => agregarOpcion(items, option));
  };
  const setCant = (id: string, delta: number) => {
    if (!locked && !guard.current)
      setCarrito((items) =>
        items
          .map((l) => (l.varianteId === id ? { ...l, cantidad: l.cantidad + delta } : l))
          .filter((l) => l.cantidad > 0),
      );
  };
  return {
    recibido,
    setRecibido,
    efectivo,
    pending,
    recovery,
    notice,
    recuperar,
    q,
    setQ,
    carrito,
    sucursalId,
    setSucursalId,
    cajaId,
    setCajaId,
    busy,
    incierto,
    error,
    guard,
    locked,
    sucursales,
    cajas,
    apertura,
    busqueda,
    preview,
    ready,
    cobrar,
    add,
    setCant,
  };
}
type CobroModel = ReturnType<typeof useCobro>;
function Cobro({ owner }: { owner: string }) {
  const model = useCobro(owner);
  const { q, setQ, carrito, locked, setCant, notice } = model;
  return (
    <View style={s.root}>
      <ScrollView style={{ maxHeight: 250 }} contentContainerStyle={s.searchBox}>
        <Text style={s.lineName}>Selecciona sucursal y caja</Text>
        <SucursalesCobro model={model} />
        <CajasCobro model={model} />
        <AperturaCobro model={model} />
      </ScrollView>
      <RecuperacionCobro model={model} />
      {notice ? (
        <Text accessibilityLiveRegion="polite" style={s.notice}>
          {notice}
        </Text>
      ) : null}
      <View style={s.searchBox}>
        <Input
          icon="search"
          value={q}
          editable={!locked}
          onChangeText={setQ}
          placeholder="Buscar producto o código…"
          autoCorrect={false}
          autoCapitalize="none"
        />
      </View>
      <BusquedaCobro model={model} />
      <FlatList
        contentContainerStyle={s.cartList}
        data={carrito}
        keyExtractor={(l) => l.varianteId}
        ListEmptyComponent={
          <EmptyState
            icon="cart-outline"
            title="Carrito vacío"
            subtitle="Busca productos para agregarlos."
          />
        }
        renderItem={({ item }) => (
          <View style={s.line}>
            <Text style={[s.lineName, { flex: 1 }]}>{item.nombre}</Text>
            <View style={s.stepper}>
              <Pressable
                accessibilityRole="button"
                disabled={locked}
                accessibilityLabel={`Quitar unidad de ${item.nombre}`}
                style={s.step}
                onPress={() => setCant(item.varianteId, -1)}
              >
                <Icon name="remove" size={18} color={colors.brand} />
              </Pressable>
              <Text style={s.cant}>{item.cantidad}</Text>
              <Pressable
                accessibilityRole="button"
                disabled={locked}
                accessibilityLabel={`Agregar unidad de ${item.nombre}`}
                style={s.step}
                onPress={() => setCant(item.varianteId, 1)}
              >
                <Icon name="add" size={18} color={colors.brand} />
              </Pressable>
            </View>
          </View>
        )}
      />
      <TotalCobro model={model} />
    </View>
  );
}

function RecuperacionCobro({ model }: { model: CobroModel }) {
  const [confirmAction, setConfirmAction] = useState<"cancelar" | "reenviar" | null>(null);
  const { pending, incierto, recovery, busy, recuperar } = model;
  if (pending.isFetching) return <Text style={s.noRes}>Verificando cobros pendientes…</Text>;
  if (pending.isError)
    return (
      <Button
        label="No se pudo verificar el cobro anterior: reintentar"
        onPress={() => void pending.refetch()}
      />
    );
  if (!incierto && pending.data !== true) return null;
  if (confirmAction)
    return (
      <ConfirmarRecuperacion
        action={confirmAction}
        busy={busy}
        onBack={() => setConfirmAction(null)}
        onConfirm={() => {
          if (busy) return;
          const action = confirmAction;
          setConfirmAction(null);
          void recuperar(action);
        }}
      />
    );
  let message = "Hay un cobro pendiente. Consulta su estado antes de continuar.";
  if (recovery?.estado === "legacy")
    message =
      "Cobro anterior sin clave recuperable. El encargado debe conciliarlo en el POS. No repitas el cobro ni borres los datos de la app.";
  if (recovery?.estado === "processing")
    message = "El servidor está procesando el mismo cobro. Consulta de nuevo; no crees otra venta.";
  if (recovery?.estado === "not_found")
    message =
      "Todavía no se encuentra el intento. Esto no confirma que no se haya enviado. Puedes consultar o reenviar exclusivamente la misma venta guardada.";
  if (recovery?.estado === "incierto")
    message =
      "No se pudo confirmar el cobro. Conservamos la misma clave y sus datos; consulta su estado sin repetir la venta.";
  if (recovery?.estado === "conciliar")
    message = `El folio ${recovery.folio} requiere conciliación con el encargado. No se reenviará.`;
  return (
    <View style={s.recovery}>
      <Text accessibilityRole="alert" style={s.error}>
        {message}
      </Text>
      <Button
        label="Consultar el mismo cobro"
        disabled={busy}
        onPress={() => void recuperar()}
        variant="outline"
      />
      {recovery?.estado !== "legacy" && recovery?.estado !== "conciliar" ? (
        <Button
          label="Cancelar intento sin venta"
          variant="outline"
          disabled={busy}
          onPress={() => setConfirmAction("cancelar")}
        />
      ) : null}
      {recovery?.estado === "not_found" ? (
        <Button
          label="Reenviar la misma venta guardada"
          disabled={busy}
          onPress={() => setConfirmAction("reenviar")}
        />
      ) : null}
    </View>
  );
}

function ConfirmarRecuperacion({
  action,
  busy,
  onBack,
  onConfirm,
}: {
  action: "cancelar" | "reenviar";
  busy: boolean;
  onBack: () => void;
  onConfirm: () => void;
}) {
  const cancel = action === "cancelar";
  return (
    <ScrollView style={{ maxHeight: 260 }} contentContainerStyle={s.recovery}>
      <Text accessibilityRole="header" style={s.lineName}>
        {cancel ? "Cancelar intento pendiente" : "Reenviar el mismo cobro"}
      </Text>
      <Text style={s.notice}>
        {cancel
          ? "Solo se libera si el servidor confirma que no existe una venta. Si ya se registró, recuperaremos su resultado sin cancelarla. Verifica el efectivo antes de volver a cobrar."
          : "Se enviará la misma clave, caja, artículos e importe guardados. No recibas efectivo otra vez."}
      </Text>
      <Button
        label={cancel ? "Confirmar cancelación del intento" : "Confirmar reenvío de la misma venta"}
        disabled={busy}
        onPress={onConfirm}
      />
      <Button label="Volver sin cambios" variant="outline" disabled={busy} onPress={onBack} />
    </ScrollView>
  );
}

function SucursalesCobro({ model }: { model: CobroModel }) {
  const { sucursales, sucursalId, locked, guard, setSucursalId, setCajaId, setRecibido } = model;
  return (
    <>
      {" "}
      {sucursales.isFetching ? (
        <ActivityIndicator />
      ) : sucursales.isError ? (
        <Button label="Reintentar carga de sucursales" onPress={() => void sucursales.refetch()} />
      ) : (
        <View style={s.choices}>
          {sucursales.data
            ?.filter((b) => b.isActive && !b.archivedAt)
            .map((b) => (
              <Button
                key={b.id}
                label={`${b.id === sucursalId ? "✓ " : ""}${b.nombre}`}
                disabled={locked}
                variant="outline"
                onPress={() => {
                  if (guard.current) return;
                  setSucursalId(b.id);
                  setCajaId("");
                  setRecibido("");
                }}
              />
            ))}
        </View>
      )}{" "}
    </>
  );
}

function CajasCobro({ model }: { model: CobroModel }) {
  const { sucursalId, cajas, cajaId, locked, guard, setCajaId, setRecibido } = model;
  return (
    <>
      {" "}
      {sucursalId ? (
        cajas.isFetching ? (
          <ActivityIndicator />
        ) : cajas.isError ? (
          <Button label="Reintentar carga de cajas" onPress={() => void cajas.refetch()} />
        ) : (
          <View style={s.choices}>
            {cajas.data
              ?.filter((c) => c.isActive && c.sucursalId === sucursalId)
              .map((c) => (
                <Button
                  key={c.id}
                  label={`${c.id === cajaId ? "✓ " : ""}${c.nombre || c.codigo}`}
                  disabled={locked}
                  variant="outline"
                  onPress={() => {
                    if (!guard.current) {
                      setCajaId(c.id);
                      setRecibido("");
                    }
                  }}
                />
              ))}
          </View>
        )
      ) : null}{" "}
    </>
  );
}

function AperturaCobro({ model }: { model: CobroModel }) {
  const { cajaId, apertura, locked } = model;
  return (
    <>
      {" "}
      {cajaId ? (
        <>
          <Text style={s.noRes}>
            {apertura.isFetching
              ? "Verificando apertura…"
              : apertura.isError
                ? "No se pudo verificar la apertura."
                : apertura.data
                  ? "Apertura verificada"
                  : "Caja cerrada: abre la caja desde el POS y vuelve a consultar."}
          </Text>
          <Button
            label="Consultar apertura"
            disabled={locked}
            onPress={() => void apertura.refetch()}
            variant="ghost"
          />
        </>
      ) : (
        <Text style={s.noRes}>
          Selecciona una caja activa. Si no aparece ninguna, solicita su configuración al encargado.
        </Text>
      )}{" "}
    </>
  );
}

function BusquedaCobro({ model }: { model: CobroModel }) {
  const { q, busqueda, locked, add } = model;
  return (
    <>
      {" "}
      {q.trim() ? (
        <View style={s.results}>
          {busqueda.isLoading ? (
            <ActivityIndicator />
          ) : busqueda.isError ? (
            <Button
              label="Error al buscar: reintentar"
              disabled={locked}
              onPress={() => void busqueda.refetch()}
            />
          ) : (
            <FlatList
              data={opcionesCobro(busqueda.data?.items ?? [])}
              keyExtractor={(p) => p.varianteId}
              style={{ maxHeight: 150 }}
              ListEmptyComponent={<Text style={s.noRes}>Sin resultados</Text>}
              renderItem={({ item }) => (
                <Pressable
                  accessibilityRole="button"
                  disabled={locked}
                  style={s.resRow}
                  onPress={() => add(item)}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={s.resName}>{item.nombre}</Text>
                    <Text>
                      SKU {item.sku} · Precio base {money(item.precio)}
                    </Text>
                  </View>
                  <Icon name="add-circle" size={24} color={colors.brand} />
                </Pressable>
              )}
            />
          )}
        </View>
      ) : null}{" "}
    </>
  );
}

function TotalCobro({ model }: { model: CobroModel }) {
  const {
    carrito,
    error,
    incierto,
    preview,
    locked,
    sucursalId,
    busy,
    ready,
    cobrar,
    recibido,
    setRecibido,
    efectivo,
  } = model;
  return (
    <>
      {" "}
      {carrito.length ? (
        <View style={s.footer}>
          {error && !incierto ? (
            <Text accessibilityRole="alert" style={s.error}>
              {error}
            </Text>
          ) : null}
          <View style={s.totalRow}>
            <Text style={s.totalLabel}>Total del servidor</Text>
            <Text style={s.totalVal}>
              {!preview.isFetching && !preview.isError && totalVerificado(preview.data?.total)
                ? money(preview.data.total)
                : "Por validar"}
            </Text>
          </View>
          {preview.isFetching ? <Text>Calculando total…</Text> : null}
          {preview.isError ? (
            <Text accessibilityRole="alert" style={s.error}>
              No se pudo calcular el total. El cobro está bloqueado.
            </Text>
          ) : null}
          <Input
            label="Efectivo recibido (MXN)"
            value={recibido}
            onChangeText={setRecibido}
            keyboardType="decimal-pad"
            maxLength={15}
            editable={!locked}
            placeholder="Escribe el efectivo contado"
          />
          <Text style={s.totalLabel}>
            Cambio: {efectivo ? money(efectivo.cambio) : "Por validar"}
          </Text>
          {recibido && !efectivo && !preview.isFetching && !preview.isError ? (
            <Text accessibilityRole="alert" style={s.error}>
              El efectivo debe cubrir el total y tener hasta dos decimales.
            </Text>
          ) : null}
          <Button
            label="Actualizar cotización"
            variant="outline"
            disabled={locked || !sucursalId}
            onPress={() => void preview.refetch()}
          />
          <Button
            label="Cobrar en efectivo"
            icon="cash"
            busy={busy}
            disabled={!ready}
            onPress={() => void cobrar()}
          />
        </View>
      ) : null}{" "}
    </>
  );
}

const s = StyleSheet.create({
  notice: {
    color: colors.ink,
    backgroundColor: colors.brandLight,
    padding: space.md,
    fontWeight: "600",
  },
  recovery: { paddingHorizontal: space.lg, gap: space.sm },
  choices: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
  error: { color: colors.danger, padding: space.sm },
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
