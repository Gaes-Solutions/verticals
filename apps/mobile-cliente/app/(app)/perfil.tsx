import { commerceError } from "@/lib/commerce-errors";
import { actualizarPerfil, getPerfil } from "@/services/cliente";
import { colors, space } from "@/theme";
import { Button, Card, CommerceError, Input, Loading, Screen } from "@/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Alert, ScrollView, StyleSheet, Text, View } from "react-native";

export default function Perfil() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["perfil"], queryFn: getPerfil });
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
        ...(apellidos.trim() ? { apellidos: apellidos.trim() } : {}),
        ...(telefono.trim() ? { telefono: telefono.trim() } : {}),
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["perfil"] });
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
    <ScrollView style={{ backgroundColor: colors.bg }} contentContainerStyle={s.root}>
      <Card>
        <Input
          label="Nombre"
          icon="person"
          value={nombre}
          onChangeText={setNombre}
          placeholder="Tu nombre"
        />
        <View style={{ height: space.md }} />
        <Input
          label="Apellidos"
          icon="person"
          value={apellidos}
          onChangeText={setApellidos}
          placeholder="Tus apellidos"
        />
        <View style={{ height: space.md }} />
        <Input
          label="Teléfono"
          icon="call"
          value={telefono}
          onChangeText={setTelefono}
          placeholder="55 1234 5678"
          keyboardType="phone-pad"
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
    </ScrollView>
  );
}

const s = StyleSheet.create({
  root: { padding: space.lg },
  email: { color: colors.muted, fontSize: 13, marginTop: space.md },
});
