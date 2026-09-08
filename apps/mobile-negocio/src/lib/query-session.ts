import { QueryClient } from "@tanstack/react-query";

export function createQuerySession(status: string, tenant: string | null, userId: string | null) {
  return {
    key: JSON.stringify([status, tenant, userId]),
    client: new QueryClient(),
  };
}
export function disposeQuerySession(session: ReturnType<typeof createQuerySession>): void {
  void session.client.cancelQueries();
  session.client.clear();
}
