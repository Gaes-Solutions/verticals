import { useAuth } from "@/lib/auth-store";
import {
  mfaDisable,
  mfaEnroll,
  mfaEnrollConfirm,
  mfaEstado,
  mfaRegenerate,
} from "@/services/negocio";
import { colors, radius, space } from "@/theme";
import { Button, Card, Icon, Input, Loading } from "@/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Alert, ScrollView, StyleSheet, Switch, Text, View } from "react-native";

export default function Seguridad() {
  const qc = useQueryClient();
  const estado = useQuery({ queryKey: ["mfa-estado"], queryFn: mfaEstado });
  const { biometriaActiva, biometriaDisponible, setBiometria } = useAuth();
  const [enroll, setEnroll] = useState<{ secret: string; otpauthUrl: string } | null>(null);
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [backup, setBackup] = useState<string[] | null>(null);

  const refrescar = () => void qc.invalidateQueries({ queryKey: ["mfa-estado"] });
  const err = (e: unknown) => Alert.alert("Error", e instanceof Error ? e.message : "Error");

  const iniciar = useMutation({ mutationFn: mfaEnroll, onSuccess: setEnroll, onError: err });
  const confirmar = useMutation({
    mutationFn: () => mfaEnrollConfirm(code),
    onSuccess: (r) => {
      setBackup(r.backupCodes);
      setEnroll(null);
      setCode("");
      refrescar();
    },
    onError: err,
  });
  const desactivar = useMutation({
    mutationFn: () => mfaDisable(password),
    onSuccess: () => {
      setPassword("");
      setBackup(null);
      refrescar();
      Alert.alert("2FA desactivado");
    },
    onError: err,
  });
  const regenerar = useMutation({
    mutationFn: () => mfaRegenerate(code),
    onSuccess: (r) => {
      setBackup(r.backupCodes);
      setCode("");
      refrescar();
    },
    onError: err,
  });

  if (estado.isLoading) return <Loading />;
  const on = estado.data?.enabled;

  return (
    <ScrollView style={{ backgroundColor: colors.bg }} contentContainerStyle={s.root}>
      <Card>
        <View style={s.head}>
          <View style={[s.lock, on ? s.lockOn : s.lockOff]}>
            <Icon
              name={on ? "lock-closed" : "lock-open"}
              size={26}
              color={on ? colors.ok : colors.faint}
            />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={s.title}>Verificación en dos pasos</Text>
            <Text style={s.sub}>
              {on
                ? `Activa · ${estado.data?.backupCodesRestantes ?? 0} códigos de respaldo`
                : "Protege tu cuenta con un código temporal."}
            </Text>
          </View>
        </View>
      </Card>

      <Card style={s.mt}>
        <View style={s.head}>
          <View style={[s.lock, s.lockOff]}>
            <Icon name="finger-print" size={26} color={colors.brand} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={s.title}>Entrar con huella / Face ID</Text>
            <Text style={s.sub}>
              {biometriaDisponible
                ? "Desbloquea la app con tu biometría."
                : "Configura una huella o Face ID en los ajustes de tu teléfono para activarlo."}
            </Text>
          </View>
          <Switch
            value={biometriaActiva}
            disabled={!biometriaDisponible}
            onValueChange={async (v) => {
              const ok = await setBiometria(v);
              if (!ok && v) Alert.alert("No se pudo activar", "Verifica tu huella/Face ID.");
            }}
            trackColor={{ true: colors.brand, false: colors.line }}
          />
        </View>
      </Card>

      {backup ? (
        <Card style={s.mt}>
          <Text style={s.h}>Códigos de respaldo</Text>
          <Text style={s.sub}>Guárdalos en un lugar seguro. Cada uno sirve una vez.</Text>
          <View style={s.codes}>
            {backup.map((c) => (
              <Text key={c} style={s.code}>
                {c}
              </Text>
            ))}
          </View>
          <View style={{ height: space.sm }} />
          <Button label="Ya los guardé" variant="outline" onPress={() => setBackup(null)} />
        </Card>
      ) : null}

      {!on ? (
        enroll ? (
          <Card style={s.mt}>
            <Text style={s.h}>Configura tu app de autenticación</Text>
            <Text style={s.sub}>Agrega esta clave en Google Authenticator / Authy:</Text>
            <View style={s.secretBox}>
              <Text style={s.secret} selectable>
                {enroll.secret}
              </Text>
            </View>
            <Text style={s.sub}>Luego escribe el código de 6 dígitos que te muestre:</Text>
            <View style={{ height: space.sm }} />
            <Input
              icon="key"
              value={code}
              onChangeText={setCode}
              placeholder="123456"
              keyboardType="number-pad"
              maxLength={6}
            />
            <View style={{ height: space.sm }} />
            <Button
              label="Activar 2FA"
              icon="shield-checkmark"
              busy={confirmar.isPending}
              disabled={code.length !== 6}
              onPress={() => confirmar.mutate()}
            />
          </Card>
        ) : (
          <View style={s.mt}>
            <Button
              label="Activar verificación en dos pasos"
              icon="shield"
              busy={iniciar.isPending}
              onPress={() => iniciar.mutate()}
            />
          </View>
        )
      ) : (
        <>
          <Card style={s.mt}>
            <Text style={s.h}>Regenerar códigos de respaldo</Text>
            <Input
              icon="key"
              value={code}
              onChangeText={setCode}
              placeholder="Código 2FA actual"
              keyboardType="number-pad"
              maxLength={6}
            />
            <View style={{ height: space.sm }} />
            <Button
              label="Regenerar"
              icon="refresh"
              variant="outline"
              busy={regenerar.isPending}
              disabled={code.length !== 6}
              onPress={() => regenerar.mutate()}
            />
          </Card>
          <Card style={s.mt}>
            <Text style={s.h}>Desactivar 2FA</Text>
            <Text style={s.sub}>Confirma con tu contraseña.</Text>
            <View style={{ height: space.sm }} />
            <Input
              icon="lock-closed"
              value={password}
              onChangeText={setPassword}
              placeholder="Tu contraseña"
              secureTextEntry
            />
            <View style={{ height: space.sm }} />
            <Button
              label="Desactivar 2FA"
              variant="danger"
              busy={desactivar.isPending}
              disabled={!password}
              onPress={() => desactivar.mutate()}
            />
          </Card>
        </>
      )}
      <View style={{ height: space.xl }} />
    </ScrollView>
  );
}

const s = StyleSheet.create({
  root: { padding: space.lg },
  mt: { marginTop: space.md },
  head: { flexDirection: "row", alignItems: "center", gap: space.md },
  lock: {
    width: 52,
    height: 52,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
  },
  lockOn: { backgroundColor: colors.okLight },
  lockOff: { backgroundColor: colors.bg },
  title: { fontSize: 16, fontWeight: "800", color: colors.ink },
  sub: { fontSize: 13, color: colors.muted, marginTop: 2 },
  h: { fontSize: 15, fontWeight: "700", color: colors.ink, marginBottom: 4 },
  secretBox: {
    backgroundColor: colors.bg,
    borderRadius: radius.md,
    padding: space.md,
    marginVertical: space.sm,
  },
  secret: {
    fontSize: 18,
    fontWeight: "800",
    color: colors.ink,
    letterSpacing: 2,
    textAlign: "center",
    fontVariant: ["tabular-nums"],
  },
  codes: { flexDirection: "row", flexWrap: "wrap", gap: space.sm, marginTop: space.sm },
  code: {
    backgroundColor: colors.bg,
    borderRadius: radius.sm,
    paddingVertical: 8,
    paddingHorizontal: 12,
    fontWeight: "700",
    color: colors.ink,
    fontVariant: ["tabular-nums"],
  },
});
