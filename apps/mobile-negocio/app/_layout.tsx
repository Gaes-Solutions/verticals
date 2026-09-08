import { useAuth } from "@/lib/auth-store";
import { QueryClientProvider } from "@tanstack/react-query";
import { Slot } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useEffect, useMemo } from "react";

import { createQuerySession, disposeQuerySession } from "@/lib/query-session";

export default function RootLayout() {
  const { restore, status, user, tenantSlug } = useAuth();
  const userId = user?.id ?? null;
  const session = useMemo(
    () => createQuerySession(status, tenantSlug, userId),
    [status, tenantSlug, userId],
  );
  useEffect(() => () => disposeQuerySession(session), [session]);
  useEffect(() => {
    void restore();
  }, [restore]);

  return (
    <QueryClientProvider key={session.key} client={session.client}>
      <StatusBar style="auto" />
      <Slot />
    </QueryClientProvider>
  );
}
