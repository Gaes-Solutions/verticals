import { getB2bDominios } from "@/services/negocio";
import { colors, radius, space } from "@/theme";
import { Badge, Card, EmptyState, Icon, Loading } from "@/ui";
import { useQuery } from "@tanstack/react-query";
import { ScrollView, StyleSheet, Text, View } from "react-native";

export default function DominioB2b() {
  const q = useQuery({ queryKey: ["b2b-dominio"], queryFn: getB2bDominios });
  if (q.isLoading) return <Loading />;
  const dominios = q.data?.dominios ?? [];

  return (
    <ScrollView style={{ backgroundColor: colors.bg }} contentContainerStyle={s.root}>
      <Text style={s.intro}>Dominios propios para el portal de tus clientes mayoristas.</Text>
      {dominios.length === 0 ? (
        <EmptyState
          icon="globe-outline"
          title="Sin dominios conectados"
          subtitle="Conecta un dominio desde el panel web para tu portal B2B."
        />
      ) : (
        dominios.map((d) => (
          <Card key={d.host} style={s.mt}>
            <View style={s.row}>
              <View style={s.icon}>
                <Icon name="globe" size={20} color={colors.brand} />
              </View>
              <Text style={[s.host, { flex: 1 }]}>{d.host}</Text>
              <Badge
                label={d.verificado ? "verificado" : "pendiente"}
                tone={d.verificado ? "ok" : "warn"}
              />
            </View>
          </Card>
        ))
      )}
    </ScrollView>
  );
}

const s = StyleSheet.create({
  root: { padding: space.lg },
  intro: { color: colors.muted, fontSize: 14, marginBottom: space.sm },
  mt: { marginTop: space.sm },
  row: { flexDirection: "row", alignItems: "center", gap: space.md },
  icon: {
    width: 40,
    height: 40,
    borderRadius: radius.sm,
    backgroundColor: colors.brandLight,
    alignItems: "center",
    justifyContent: "center",
  },
  host: { fontWeight: "700", color: colors.ink, fontSize: 15 },
});
