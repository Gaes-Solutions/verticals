import { NextResponse } from "next/server";
export const registroJson = (value: unknown, status = 200) =>
  NextResponse.json(value, { status, headers: { "Cache-Control": "private, no-store" } });
export function origenRegistroValido(req: Request): boolean {
  try {
    const raw = req.headers.get("origin");
    const origin = new URL(raw ?? "");
    return (
      raw === origin.origin &&
      origin.host.toLowerCase() === req.headers.get("host")?.toLowerCase() &&
      (origin.protocol === "https:" ||
        (origin.protocol === "http:" && ["localhost", "127.0.0.1"].includes(origin.hostname))) &&
      req.headers.get("content-type")?.split(";")[0]?.trim() === "application/json"
    );
  } catch {
    return false;
  }
}
