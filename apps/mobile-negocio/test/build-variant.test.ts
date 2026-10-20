import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { mobileBusinessBuildConfig } from "../src/build-variant";

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
});
