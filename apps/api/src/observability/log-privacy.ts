import type { FastifyRequest } from "fastify";
import { sanitizeIncidentRoute, sanitizeIncidentText } from "./incident-sanitizer.js";

function read(value: object, key: string): unknown {
  try {
    return Reflect.get(value, key);
  } catch {
    return undefined;
  }
}

function text(value: unknown, limit: number): string | undefined {
  return typeof value === "string" ? sanitizeIncidentText(value).slice(0, limit) : undefined;
}

function primitiveMessage(value: unknown): string {
  if (typeof value === "function" || typeof value === "symbol") return "[valor no serializable]";
  return text(String(value), 2000) ?? "";
}

interface SerializedLogError extends Record<string, unknown> {
  type: string;
  message: string;
  stack: string;
}

function diagnosticFields(value: object): SerializedLogError {
  const output: SerializedLogError = {
    message: "",
    stack: "",
    type: text(read(value, "name"), 100) ?? "Object",
  };
  for (const [key, limit] of [
    ["message", 2000],
    ["stack", 8000],
    ["code", 100],
  ] as const) {
    const safe = text(read(value, key), limit);
    if (safe !== undefined) output[key] = safe;
  }
  const statusCode = read(value, "statusCode");
  if (typeof statusCode === "number" && Number.isFinite(statusCode)) output.statusCode = statusCode;
  return output;
}

/** Explicit projection: Axios configs, request/response bodies and custom error fields stay private. */
export function serializeLogError(error: unknown): SerializedLogError {
  const seen = new Set<object>();
  const project = (value: unknown, depth: number): SerializedLogError => {
    if (value === null || typeof value !== "object")
      return { type: typeof value, message: primitiveMessage(value), stack: "" };
    if (depth > 3 || seen.has(value)) return { type: "Error", message: "[truncado]", stack: "" };
    seen.add(value);
    const output = diagnosticFields(value);
    const cause = read(value, "cause");
    if (cause !== undefined) output.cause = project(cause, depth + 1);
    return output;
  };
  try {
    return project(error, 0);
  } catch {
    return { type: "Error", message: "[error no serializable]", stack: "" };
  }
}

export function serializeLogRequest(req: FastifyRequest): Record<string, unknown> {
  return {
    method: req.method,
    url: sanitizeIncidentRoute(req.url),
    hostname: req.hostname,
    remoteAddress: req.ip,
  };
}

/** The message serializer also protects Pino's implicit Error.message duplication. */
export function createLogSerializers() {
  return {
    req: serializeLogRequest,
    err: serializeLogError,
    error: serializeLogError,
    msg: (value: unknown) => text(value, 8000) ?? "[mensaje no textual]",
  };
}
