import { passwordChangeError } from "@/lib/account-errors";
import { useAuth } from "@/lib/auth-store";
import { commerceError } from "@/lib/commerce-errors";
import { actualizarPerfil, cambiarPassword, getPerfil } from "@/services/cliente";
import { colors, space } from "@/theme";
import { Button, Card, CommerceError, EntraParaVer, Input, Loading, Screen } from "@/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from "react-native";

export default function Perfil() {
  const { status, tenantSlug, user } = useAuth();
  if (status !== "signedIn" || !user)
    return (
      <EntraParaVer
        icono="person"
        titulo="Mi perfil"
        texto="Entra para actualizar tus datos y tu contraseña."
      />
    );
  return <PerfilConSesion key={`${tenantSlug}:${user.id}`} />;
}
function PerfilConSesion() {
  const { tenantSlug, user } = useAuth();
  const queryKey = ["perfil", tenantSlug, user?.id];
  const qc = useQueryClient();
  const q = useQuery({ queryKey, queryFn: getPerfil });
  const [nombre, setNombre] = useState("");
  const [apellidos, setApellidos] = useState("");
  const [telefono, setTelefono] = useState("");

  useEffect(() => {
    if (q.data) {
      setNombre(q.data.nombre ?? "");
      setApellidos(q.data.apellidos ?? "");
      setTelefono(q.data.telefono ?? "");
    }
  }, [q.data]);

  const save = useMutation({
    mutationFn: () =>
      actualizarPerfil({
        nombre: nombre.trim(),
        apellidos: apellidos.trim(),
        telefono: telefono.trim(),
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey });
      Alert.alert("Guardado");
    },
    onError: (e) => Alert.alert("No se pudo guardar", commerceError(e)),
  });

  if (q.isLoading) return <Loading />;
  if (q.isError)
    return (
      <Screen>
        <CommerceError
          error={q.error}
          message="No pudimos cargar tu perfil. Revisa tu conexión y vuelve a intentar."
          retry={() => void q.refetch()}
        />
      </Screen>
    );

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <ScrollView
        style={{ backgroundColor: colors.bg }}
        contentContainerStyle={s.root}
        keyboardShouldPersistTaps="handled"
      >
        <Card>
          <Input
            label="Nombre"
            icon="person"
            value={nombre}
            onChangeText={setNombre}
            placeholder="Tu nombre"
            maxLength={120}
            editable={!save.isPending}
          />
          <View style={{ height: space.md }} />
          <Input
            label="Apellidos"
            icon="person"
            value={apellidos}
            onChangeText={setApellidos}
            placeholder="Tus apellidos"
            maxLength={120}
            editable={!save.isPending}
          />
          <View style={{ height: space.md }} />
          <Input
            label="Teléfono"
            icon="call"
            value={telefono}
            onChangeText={setTelefono}
            placeholder="55 1234 5678"
            keyboardType="phone-pad"
            maxLength={20}
            editable={!save.isPending}
          />
          <Text style={s.email}>Correo: {q.data?.email ?? "—"}</Text>
          <View style={{ height: space.md }} />
          <Button
            label="Guardar cambios"
            icon="save"
            busy={save.isPending}
            disabled={!nombre.trim()}
            onPress={() => save.mutate()}
          />
        </Card>
        <PasswordCard />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function PasswordCard() {
  const [actual, setActual] = useState("");
  const [nueva, setNueva] = useState("");
  const [visible, setVisible] = useState(false);
  const [success, setSuccess] = useState(false);
  const change = useMutation({
    mutationFn: () => cambiarPassword({ actual, nueva }),
    onMutate: () => setSuccess(false),
    onSuccess: () => {
      setActual("");
      setNueva("");
      setVisible(false);
      setSuccess(true);
    },
  });
  return (
    <Card style={{ marginTop: space.lg }}>
      <Text style={{ color: colors.ink, fontSize: 18, fontWeight: "700", marginBottom: space.md }}>
        Cambiar contraseña
      </Text>
      <Input
        label="Contraseña actual"
        value={actual}
        onChangeText={setActual}
        secureTextEntry={!visible}
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete="current-password"
        textContentType="password"
        editable={!change.isPending}
      />
      <View style={{ height: space.md }} />
      <Input
        label="Nueva contraseña"
        value={nueva}
        onChangeText={setNueva}
        secureTextEntry={!visible}
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete="new-password"
        textContentType="newPassword"
        maxLength={100}
        editable={!change.isPending}
      />
      <Text style={{ color: colors.muted, marginTop: 6 }}>Usa al menos 8 caracteres.</Text>
      <View
        style={{ flexDirection: "row", alignItems: "center", gap: 12, marginVertical: space.md }}
      >
        <Text style={{ flex: 1, color: colors.ink }}>Mostrar contraseñas</Text>
        <Switch
          accessibilityLabel="Mostrar contraseñas"
          value={visible}
          onValueChange={setVisible}
          disabled={change.isPending}
          trackColor={{ true: colors.brand, false: colors.line }}
        />
      </View>
      {change.isError && (
        <Text accessibilityRole="alert" style={{ color: colors.danger, marginBottom: space.sm }}>
          {passwordChangeError(change.error)}
        </Text>
      )}
      {success && (
        <Text accessibilityRole="alert" style={{ color: colors.brand, marginBottom: space.sm }}>
          Contraseña actualizada.
        </Text>
      )}
      <Button
        label="Actualizar contraseña"
        icon="lock-closed"
        busy={change.isPending}
        disabled={!actual || nueva.length < 8}
        onPress={() => change.mutate()}
      />
    </Card>
  );
}

const s = StyleSheet.create({
  root: { padding: space.lg },
  email: { color: colors.muted, fontSize: 13, marginTop: space.md },
});
