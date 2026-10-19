import type { Event, NodeOptions } from "@sentry/node";

type SpanPayload = Parameters<NonNullable<NodeOptions["beforeSendSpan"]>>[0];
const DATABASE_IDENTITIES = ["db.user", "db.username", "db.user.name"];

function stripDatabaseIdentities<T>(attributes: Record<string, T>): Record<string, T> {
  const clean = { ...attributes };
  for (const key of DATABASE_IDENTITIES) delete clean[key];
  return clean;
}

/** Sentry's child-span hook does not run for root transactions. */
export function scrubSentrySpan(span: SpanPayload): SpanPayload {
  return {
    ...span,
    ...(span.data ? { data: stripDatabaseIdentities(span.data) } : {}),
  };
}

/** Remove database identity attributes at the final outbound event boundary.
 * This mitigates the instrumentation db.user disclosure; it does not patch the
 * separate OpenTelemetry baggage parser advisory or sanitize all telemetry PII.
 */
export function scrubSentryEvent<T extends Event>(event: T): T {
  const trace = event.contexts?.trace;
  return {
    ...event,
    ...(event.tags ? { tags: stripDatabaseIdentities(event.tags) } : {}),
    ...(event.spans ? { spans: event.spans.map(scrubSentrySpan) } : {}),
    ...(trace
      ? {
          contexts: {
            ...event.contexts,
            trace: {
              ...trace,
              ...(trace.data ? { data: stripDatabaseIdentities(trace.data) } : {}),
              ...(trace.tags ? { tags: stripDatabaseIdentities(trace.tags) } : {}),
            },
          },
        }
      : {}),
  };
}
