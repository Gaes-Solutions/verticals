import { money } from "@/lib/format";
import { type PrecioKiosko, getIdle, getKioskoConfig, getPrecio } from "@/services/kiosko";
import { colors, radius, space } from "@/theme";
import { Icon } from "@/ui";
import { useQuery } from "@tanstack/react-query";
import { CameraView, useCameraPermissions } from "expo-camera";
import { router } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, Image, Pressable, StyleSheet, Text, View } from "react-native";

type Modo = "espera" | "precio" | "reposo";

export default function Verificador() {
  const cfg = useQuery({ queryKey: ["kiosko-config"], queryFn: getKioskoConfig });
  const [permission, requestPermission] = useCameraPermissions();
  const [modo, setModo] = useState<Modo>("espera");
  const [precio, setPrecio] = useState<PrecioKiosko | null>(null);
  const [buscando, setBuscando] = useState(false);
  const lastScan = useRef<{ codigo: string; at: number }>({ codigo: "", at: 0 });
  const timers = useRef<{
    reposo?: ReturnType<typeof setTimeout>;
    precio?: ReturnType<typeof setTimeout>;
  }>({});

  const acento = cfg.data?.colorAcento ?? colors.brand;
  const reposoMs = (cfg.data?.reposoSegundos ?? 20) * 1000;
  const precioMs = (cfg.data?.precioSegundos ?? 8) * 1000;

  useEffect(() => {
    if (permission && !permission.granted) void requestPermission();
  }, [permission, requestPermission]);

  // Timer de reposo: en "espera", tras N seg sin escanear → "reposo".
  const armarReposo = useCallback(() => {
    if (timers.current.reposo) clearTimeout(timers.current.reposo);
    timers.current.reposo = setTimeout(() => setModo("reposo"), reposoMs);
  }, [reposoMs]);

  useEffect(() => {
    if (modo === "espera") armarReposo();
    return () => {
      if (timers.current.reposo) clearTimeout(timers.current.reposo);
    };
  }, [modo, armarReposo]);

  const onBarcode = useCallback(
    async (codigo: string) => {
      const now = Date.now();
      if (buscando) return;
      if (codigo === lastScan.current.codigo && now - lastScan.current.at < 2500) return;
      lastScan.current = { codigo, at: now };
      setBuscando(true);
      if (timers.current.reposo) clearTimeout(timers.current.reposo);
      try {
        const r = await getPrecio(codigo);
        setPrecio(r.encontrado ? r : { encontrado: false });
      } catch {
        setPrecio({ encontrado: false });
      }
      setModo("precio");
      setBuscando(false);
      if (timers.current.precio) clearTimeout(timers.current.precio);
      timers.current.precio = setTimeout(() => {
        setPrecio(null);
        setModo("espera");
      }, precioMs);
    },
    [buscando, precioMs],
  );

  if (cfg.isLoading || !permission) {
    return (
      <Centro>
        <ActivityIndicator size="large" color={colors.brand} />
      </Centro>
    );
  }
  if (!permission.granted) {
    return (
      <Centro>
        <Icon name="camera" size={48} color={colors.faint} />
        <Text style={s.permTitle}>Permiso de cámara requerido</Text>
        <Pressable
          style={[s.permBtn, { backgroundColor: acento }]}
          onPress={() => void requestPermission()}
        >
          <Text style={s.permBtnText}>Permitir cámara</Text>
        </Pressable>
      </Centro>
    );
  }

  return (
    <View style={s.root}>
      {/* Cámara siempre montada (lee códigos), oculta tras el contenido según el modo */}
      <CameraView
        style={StyleSheet.absoluteFill}
        facing="back"
        barcodeScannerSettings={{
          barcodeTypes: ["ean13", "ean8", "upc_a", "upc_e", "code128", "code39", "qr"],
        }}
        onBarcodeScanned={({ data }) => void onBarcode(data)}
      />

      {modo === "reposo" ? (
        <Reposo
          acento={acento}
          slideMs={(cfg.data?.slideSegundos ?? 6) * 1000}
          onSalir={() => setModo("espera")}
        />
      ) : modo === "precio" && precio ? (
        <Precio
          precio={precio}
          acento={acento}
          mostrarExistencia={cfg.data?.mostrarExistencia ?? false}
          onEscanea={() => {
            setPrecio(null);
            setModo("espera");
          }}
        />
      ) : (
        <Espera
          mensaje={cfg.data?.mensajeBienvenida ?? "Escanea tu producto"}
          acento={acento}
          buscando={buscando}
        />
      )}

      {/* Toque oculto (esquina) para reconfigurar el dispositivo */}
      <Pressable style={s.reconfig} onLongPress={() => router.replace("/setup")} />
    </View>
  );
}

function Espera({
  mensaje,
  acento,
  buscando,
}: { mensaje: string; acento: string; buscando: boolean }) {
  return (
    <View style={[s.overlay, { backgroundColor: "rgba(15,23,42,0.55)" }]}>
      <View style={[s.marco, { borderColor: acento }]}>
        {buscando ? (
          <ActivityIndicator size="large" color={colors.white} />
        ) : (
          <Icon name="barcode" size={64} color={colors.white} />
        )}
      </View>
      <Text style={s.esperaMsg}>{mensaje}</Text>
      <Text style={s.esperaSub}>Acerca el código de barras a la cámara</Text>
    </View>
  );
}

function Precio({
  precio,
  acento,
  mostrarExistencia,
  onEscanea,
}: { precio: PrecioKiosko; acento: string; mostrarExistencia: boolean; onEscanea: () => void }) {
  if (!precio.encontrado) {
    return (
      <View style={[s.overlay, { backgroundColor: colors.card }]}>
        <Icon name="alert-circle" size={72} color={colors.warn} />
        <Text style={s.noEnc}>Producto no encontrado</Text>
        <Text style={s.esperaSub2}>Intenta con otro producto</Text>
      </View>
    );
  }
  return (
    <Pressable style={[s.overlay, s.precioBg]} onPress={onEscanea}>
      <View style={s.precioRow}>
        {precio.imagen ? (
          <Image source={{ uri: precio.imagen }} style={s.foto} resizeMode="contain" />
        ) : (
          <View style={[s.foto, s.fotoPlaceholder]}>
            <Icon name="cube" size={64} color={colors.faint} />
          </View>
        )}
        <View style={{ flex: 1 }}>
          <Text style={s.nombre} numberOfLines={3}>
            {precio.nombre}
          </Text>
          <Text style={s.sku}>{precio.sku}</Text>
          {precio.precioAntes ? <Text style={s.antes}>{money(precio.precioAntes)}</Text> : null}
          <Text style={[s.precioBig, { color: acento }]}>{money(precio.precioVigente ?? "0")}</Text>
          {precio.promoLabel ? (
            <View style={[s.promoTag, { backgroundColor: acento }]}>
              <Text style={s.promoText}>{precio.promoLabel}</Text>
            </View>
          ) : null}
          {mostrarExistencia && precio.existencia != null ? (
            <Text style={s.existencia}>Disponibles: {precio.existencia}</Text>
          ) : null}
        </View>
      </View>
      <Text style={s.tocaEscanea}>Escanea otro producto</Text>
    </Pressable>
  );
}

function Reposo({
  acento,
  slideMs,
  onSalir,
}: { acento: string; slideMs: number; onSalir: () => void }) {
  const idle = useQuery({ queryKey: ["kiosko-idle"], queryFn: getIdle });
  const slides = idle.data?.slides ?? [];
  const [i, setI] = useState(0);
  useEffect(() => {
    if (slides.length === 0) return;
    const t = setInterval(() => setI((x) => (x + 1) % slides.length), slideMs);
    return () => clearInterval(t);
  }, [slides.length, slideMs]);
  const slide = slides[i];
  return (
    <Pressable style={[s.overlay, s.reposoBg]} onPress={onSalir}>
      {slide ? (
        <>
          {slide.imagen ? (
            <Image source={{ uri: slide.imagen }} style={s.reposoImg} resizeMode="cover" />
          ) : (
            <View style={[s.reposoIcon, { backgroundColor: acento }]}>
              <Icon name="megaphone" size={64} color={colors.white} />
            </View>
          )}
          <Text style={s.reposoTitulo}>{slide.titulo}</Text>
          {slide.texto ? <Text style={s.reposoTexto}>{slide.texto}</Text> : null}
        </>
      ) : (
        <View style={[s.reposoIcon, { backgroundColor: acento }]}>
          <Icon name="storefront" size={72} color={colors.white} />
        </View>
      )}
      <Text style={s.reposoHint}>Toca o escanea para verificar un precio</Text>
    </Pressable>
  );
}

function Centro({ children }: { children: React.ReactNode }) {
  return (
    <View
      style={[
        s.root,
        { alignItems: "center", justifyContent: "center", backgroundColor: colors.bg },
      ]}
    >
      {children}
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#000" },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    padding: space.xxl,
  },
  marco: {
    width: 220,
    height: 140,
    borderWidth: 4,
    borderRadius: radius.lg,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: space.lg,
  },
  esperaMsg: { fontSize: 34, fontWeight: "800", color: colors.white, textAlign: "center" },
  esperaSub: { fontSize: 18, color: "rgba(255,255,255,0.8)", marginTop: space.sm },
  esperaSub2: { fontSize: 18, color: colors.muted, marginTop: space.sm },
  precioBg: { backgroundColor: colors.card },
  precioRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.xxl,
    width: "90%",
    maxWidth: 900,
  },
  foto: { width: 220, height: 220, borderRadius: radius.lg, backgroundColor: colors.bg },
  fotoPlaceholder: { alignItems: "center", justifyContent: "center" },
  nombre: { fontSize: 34, fontWeight: "800", color: colors.ink },
  sku: { fontSize: 16, color: colors.faint, marginTop: 4 },
  antes: {
    fontSize: 26,
    color: colors.faint,
    textDecorationLine: "line-through",
    marginTop: space.md,
  },
  precioBig: { fontSize: 84, fontWeight: "900", marginTop: 4 },
  promoTag: {
    alignSelf: "flex-start",
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: radius.pill,
    marginTop: space.sm,
  },
  promoText: { color: colors.white, fontWeight: "800", fontSize: 16 },
  existencia: { fontSize: 18, color: colors.muted, marginTop: space.md },
  tocaEscanea: { position: "absolute", bottom: space.xl, fontSize: 16, color: colors.faint },
  noEnc: { fontSize: 30, fontWeight: "800", color: colors.ink, marginTop: space.md },
  reposoBg: { backgroundColor: colors.ink },
  reposoImg: { width: "60%", height: "55%", borderRadius: radius.xl },
  reposoIcon: {
    width: 140,
    height: 140,
    borderRadius: radius.xl,
    alignItems: "center",
    justifyContent: "center",
  },
  reposoTitulo: {
    fontSize: 40,
    fontWeight: "800",
    color: colors.white,
    textAlign: "center",
    marginTop: space.xl,
  },
  reposoTexto: {
    fontSize: 22,
    color: "rgba(255,255,255,0.85)",
    textAlign: "center",
    marginTop: space.sm,
  },
  reposoHint: {
    position: "absolute",
    bottom: space.xl,
    fontSize: 16,
    color: "rgba(255,255,255,0.6)",
  },
  permTitle: { fontSize: 22, fontWeight: "700", color: colors.ink, marginTop: space.md },
  permBtn: {
    paddingHorizontal: space.xl,
    paddingVertical: space.md,
    borderRadius: radius.md,
    marginTop: space.lg,
  },
  permBtnText: { color: colors.white, fontWeight: "700", fontSize: 16 },
  reconfig: { position: "absolute", top: 0, right: 0, width: 60, height: 60 },
});
