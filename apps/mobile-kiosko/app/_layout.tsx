import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { activateKeepAwakeAsync } from "expo-keep-awake";
import { Slot } from "expo-router";
import * as ScreenOrientation from "expo-screen-orientation";
import { StatusBar } from "expo-status-bar";
import { useEffect } from "react";

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, staleTime: 30_000 } },
});

export default function RootLayout() {
  useEffect(() => {
    void activateKeepAwakeAsync();
    void ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.LANDSCAPE);
  }, []);
  return (
    <QueryClientProvider client={queryClient}>
      <StatusBar hidden />
      <Slot />
    </QueryClientProvider>
  );
}
