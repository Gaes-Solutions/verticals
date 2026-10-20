import { execFileSync } from "node:child_process";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { mobileBusinessBuildConfig } from "../build-variant.cjs";

const eas = JSON.parse(readFileSync(resolve(process.cwd(), "eas.json"), "utf8"));

describe("mobile business app build variants", () => {
  it("defaults local and preview builds to an isolated staging identity and API", () => {
    expect(mobileBusinessBuildConfig(undefined)).toEqual({
      variant: "staging",
      apiUrl: "https://verticals-staging.up.railway.app/api",
      name: "GaesSoft Negocio (Pruebas)",
      scheme: "gaessoft-negocio-staging",
      package: "com.gaessoft.negocio.staging",
    });
  });

  it("selects production only when the build profile explicitly requests it", () => {
    expect(mobileBusinessBuildConfig("production")).toEqual({
      variant: "production",
      apiUrl: "https://app.angaes.com/api",
      name: "GaesSoft Negocio",
      scheme: "gaessoft-negocio",
      package: "com.gaessoft.negocio",
    });
  });

  it("rejects an API override that crosses environment boundaries", () => {
    expect(() => mobileBusinessBuildConfig("staging", "https://app.angaes.com/api")).toThrow(
      "no coincide con el perfil staging",
    );
    expect(() =>
      mobileBusinessBuildConfig("production", "https://verticals-staging.up.railway.app/api"),
    ).toThrow("no coincide con el perfil production");
  });

  it("rejects unknown build variants rather than guessing an API", () => {
    expect(() => mobileBusinessBuildConfig("prod")).toThrow("APP_VARIANT debe ser");
  });

  it("keeps EAS development and preview builds on staging and production explicit", () => {
    for (const profile of ["development", "preview"]) {
      expect(eas.build[profile].env.APP_VARIANT).toBe("staging");
      expect(eas.build[profile].env.EXPO_PUBLIC_API_URL).toBe(
        "https://verticals-staging.up.railway.app/api",
      );
    }
    expect(eas.build.production.env.APP_VARIANT).toBe("production");
    expect(eas.build.production.env.EXPO_PUBLIC_API_URL).toBe("https://app.angaes.com/api");
  });

  it("loads both variants through Expo's real config resolver", () => {
    const project = process.cwd();
    for (const [variant, apiUrl, packageName] of [
      ["staging", "https://verticals-staging.up.railway.app/api", "com.gaessoft.negocio.staging"],
      ["production", "https://app.angaes.com/api", "com.gaessoft.negocio"],
    ]) {
      const output = execFileSync(
        join(project, "node_modules/.bin/expo"),
        ["config", "--json", "."],
        {
          cwd: project,
          env: {
            ...process.env,
            APP_VARIANT: variant,
            EXPO_PUBLIC_API_URL: apiUrl,
            EXPO_NO_DOTENV: "1",
          },
        },
      );
      const config = JSON.parse(output.toString("utf8"));
      expect(config.android.package).toBe(packageName);
      expect(config.ios.bundleIdentifier).toBe(packageName);
      expect(config.extra.appVariant).toBe(variant);
      expect(config.extra.apiUrl).toBe(apiUrl);
    }
  });

  it("exports a staging Android bundle without production endpoints or provider secrets", () => {
    const project = process.cwd();
    const expoDir = join(project, ".expo");
    mkdirSync(expoDir, { recursive: true });
    const output = mkdtempSync(join(expoDir, "qa-staging-export-"));
    chmodSync(output, 0o700);
    try {
      execFileSync(
        join(project, "node_modules/.bin/expo"),
        ["export", "--platform", "android", "--output-dir", output],
        {
          cwd: project,
          timeout: 60000,
          maxBuffer: 5_000_000,
          stdio: "pipe",
          env: {
            ...process.env,
            APP_VARIANT: "staging",
            EXPO_PUBLIC_API_URL: "https://verticals-staging.up.railway.app/api",
            EXPO_NO_DOTENV: "1",
          },
        },
      );
      const androidBundles = join(output, "_expo", "static", "js", "android");
      const bundles = readdirSync(androidBundles).filter(
        (file) => file.endsWith(".hbc") || file.endsWith(".bundle"),
      );
      expect(bundles.length).toBeGreaterThan(0);
      const contents = bundles.map((file) => readFileSync(join(androidBundles, file))).join("\n");
      expect(contents).not.toContain("https://app.angaes.com/api");
      expect(contents).not.toMatch(/(?:sk_live_|whsec_)[A-Za-z0-9]{24,}/);
    } finally {
      rmSync(output, { recursive: true, force: true });
    }
  }, 60000);
});
