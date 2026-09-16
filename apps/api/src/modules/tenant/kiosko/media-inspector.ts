import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { promisify } from "node:util";
import { KioskoMediaError, preflightMedia, validateInspectedAsset } from "./media-contract.js";
const execute = promisify(execFile);
async function sandbox(tool: string, input: string, args: string[]) {
  const libs = process.env.KIOSKO_MEDIA_LIBRARY_DIR;
  return execute(
    "prlimit",
    [
      "--as=805306368",
      "--cpu=30",
      "--nofile=64",
      "--",
      "bwrap",
      "--unshare-all",
      "--die-with-parent",
      "--new-session",
      "--ro-bind",
      "/usr",
      "/usr",
      "--ro-bind",
      "/lib",
      "/lib",
      "--ro-bind",
      "/lib64",
      "/lib64",
      "--ro-bind",
      "/etc/alternatives",
      "/etc/alternatives",
      "--proc",
      "/proc",
      "--dev",
      "/dev",
      "--tmpfs",
      "/tmp",
      "--ro-bind",
      input,
      "/input",
      "--ro-bind",
      tool,
      "/tool",
      ...(libs
        ? ["--ro-bind", libs, "/extra-libs", "--setenv", "LD_LIBRARY_PATH", "/extra-libs"]
        : []),
      "--",
      "/tool",
      ...args,
    ],
    {
      timeout: 35_000,
      killSignal: "SIGKILL",
      maxBuffer: 256 * 1024,
      env: { PATH: "/usr/bin:/bin" },
    },
  );
}
export async function inspectMedia(
  path: string,
  tenantId: string,
  assetId: string,
  mime: "image/jpeg" | "image/png" | "video/mp4",
  declaredBytes: number,
) {
  const bytes = await readFile(path);
  preflightMedia(bytes, mime, declaredBytes);
  let raw: {
    streams: Array<{
      codec_type: string;
      codec_name: string;
      width?: number;
      height?: number;
      avg_frame_rate?: string;
    }>;
    format: { duration?: string };
  };
  try {
    const out = await sandbox(process.env.KIOSKO_FFPROBE ?? "/usr/bin/ffprobe", path, [
      "-v",
      "error",
      "-max_alloc",
      "268435456",
      "-protocol_whitelist",
      "file,pipe",
      "-show_streams",
      "-show_format",
      "-of",
      "json",
      "/input",
    ]);
    raw = JSON.parse(out.stdout);
  } catch {
    throw new KioskoMediaError(
      "INSPECTION_FAILED",
      "No se pudo inspeccionar el archivo en aislamiento",
    );
  }
  const video = raw.streams?.filter((s) => s.codec_type === "video");
  const audio = raw.streams?.filter((s) => s.codec_type === "audio") ?? [];
  if (
    video?.length !== 1 ||
    !video[0] ||
    audio.length > 1 ||
    raw.streams.some((s) => !["video", "audio"].includes(s.codec_type))
  )
    throw new KioskoMediaError("INVALID_TRACKS", "El archivo contiene pistas no admitidas");
  const stream = video[0];
  const [numerator, denominator] = (stream.avg_frame_rate ?? "0/1").split("/").map(Number);
  const isVideo = mime === "video/mp4";
  if (
    (!isVideo && audio.length) ||
    (mime === "image/png" && stream.codec_name !== "png") ||
    (mime === "image/jpeg" && stream.codec_name !== "mjpeg")
  )
    throw new KioskoMediaError("INVALID_CODEC", "Formato de imagen inválido");
  const metadata = validateInspectedAsset(
    {
      id: assetId,
      tenantId,
      status: "ready",
      mime,
      bytes: bytes.byteLength,
      sha256: createHash("sha256").update(bytes).digest("hex"),
      width: stream.width,
      height: stream.height,
      durationMs: isVideo ? Math.ceil(Number(raw.format.duration) * 1000) : null,
      codec: isVideo ? stream.codec_name : null,
      fps: isVideo ? (numerator ?? 0) / (denominator ?? 1) : null,
      audioCodec: audio[0]?.codec_name ?? null,
    },
    tenantId,
  );
  try {
    await sandbox(process.env.KIOSKO_FFMPEG ?? "/usr/bin/ffmpeg", path, [
      "-v",
      "error",
      "-xerror",
      "-nostdin",
      "-threads",
      "1",
      "-max_alloc",
      "268435456",
      "-protocol_whitelist",
      "file,pipe",
      "-i",
      "/input",
      "-threads",
      "1",
      "-f",
      "null",
      "-",
    ]);
  } catch {
    throw new KioskoMediaError(
      "DECODE_FAILED",
      "El archivo está dañado o excedió el tiempo de inspección",
    );
  }
  return metadata;
}
