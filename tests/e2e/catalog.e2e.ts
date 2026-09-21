import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "@playwright/test";
import { CATALOGO, CUENTA } from "./siembra.js";

const root = process.env.E2E_REPO_ROOT ?? process.cwd();
// Real SQLite and HTTP API; only the WebView-to-SQL transport is substituted.
test("escritorio guarda catálogo, conserva la versión sin red y se adapta a 360px", async ({
  page,
  context,
}) => {
  const directory = mkdtempSync(join(tmpdir(), "gaes-catalog-browser-"));
  function sql(mode: string, query: string, binds: unknown[] = []): unknown {
    return JSON.parse(
      execFileSync(
        "python3",
        [
          "-c",
          `
import sqlite3,json,sys
p=json.load(sys.stdin)
with sqlite3.connect(p['path']) as db:
 db.row_factory=sqlite3.Row
 if p['mode']=='script': db.executescript(p['query']); result=None
 else:
  cursor=db.execute(p['query'],p['binds'])
  result=[dict(row) for row in cursor.fetchall()] if p['mode']=='select' else [cursor.rowcount,cursor.lastrowid]
 print(json.dumps(result))
`,
        ],
        {
          input: JSON.stringify({ path: join(directory, "pos.sqlite"), mode, query, binds }),
          encoding: "utf8",
        },
      ),
    );
  }
  try {
    for (const file of ["001_sync_local.sql", "002_scoped_sync.sql", "003_catalog_versions.sql"])
      sql(
        "script",
        readFileSync(join(root, "apps/pos-desktop/src-tauri/migrations", file), "utf8"),
      );
    await page.exposeBinding(
      "qaSql",
      async (_, command: string, args: { db: string; query: string; values: unknown[] }) => {
        if (command === "plugin:sql|load") return args.db;
        if (command === "plugin:sql|select") return sql("select", args.query, args.values);
        if (command === "plugin:sql|execute") return sql("execute", args.query, args.values);
        throw new Error(`Unexpected native command: ${command}`);
      },
    );
    await page.addInitScript(() => {
      Object.assign(window, {
        isTauri: true,
        __TAURI_INTERNALS__: {
          invoke: (command: string, args: unknown) =>
            (
              window as unknown as { qaSql(command: string, args: unknown): Promise<unknown> }
            ).qaSql(command, args),
        },
      });
    });
    await page.goto("/");
    await page.getByLabel("Correo").fill(CUENTA.email);
    await page.getByLabel("Contraseña").fill(CUENTA.password);
    await page.getByRole("button", { name: "Entrar", exact: true }).click();
    await page.getByLabel("Sucursal").selectOption({ index: 1 });
    await expect(page.getByLabel("Caja")).toBeEnabled();
    await page.getByLabel("Caja").selectOption({ index: 1 });
    await page.getByRole("button", { name: "Consultar estado de caja" }).click();
    const enter = page.getByRole("button", { name: "Entrar a vender" });
    const open = page.getByRole("button", { name: "Abrir caja con este fondo" });
    await expect(enter.or(open)).toBeVisible();
    if (await open.isVisible()) {
      await page.getByPlaceholder("Escribe el efectivo contado").fill("1000");
      await open.click();
    }
    await enter.click();
    const status = page.getByRole("region", { name: "Catálogo del equipo" });
    await expect(status).toContainText("Catálogo guardado en este equipo");
    const readActive = () =>
      sql("select", "SELECT value FROM pos_sync_meta WHERE key='catalog_active'") as {
        value: string;
      }[];
    const original = readActive()[0]?.value;
    expect(original).toBeTruthy();
    for (const width of [360, 768, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      await expect(status.getByRole("button", { name: "Actualizar catálogo" })).toBeVisible();
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
      ).toBe(true);
      await page.screenshot({ path: `/tmp/gaes-catalog-${width}.png`, fullPage: true });
    }
    await page.route("**/api/**", (route) => route.abort("internetdisconnected"));
    await status.getByRole("button", { name: "Actualizar catálogo" }).click();
    await expect(status).toContainText("Catálogo pendiente de actualizar");
    expect(readActive()[0]?.value).toBe(original);
    const search = page.getByPlaceholder("Buscar producto o escanear código…");
    await search.fill("Café");
    await expect(page.getByText(CATALOGO[0].nombre).first()).toBeVisible();
    await expect(
      page.getByText("Resultados del catálogo guardado.", { exact: false }),
    ).toBeVisible();
    await search.fill(CATALOGO[0].codigo);
    await search.press("Enter");
    await expect(page.getByRole("button", { name: /Cobrar/ })).toBeEnabled();
    await page.getByRole("button", { name: /Cobrar/ }).click();
    await expect(page.getByRole("button", { name: "Confirmar", exact: true })).toHaveCount(0);
    await page.reload();
    await expect(page.getByRole("heading", { name: "Consulta sin conexión" })).toBeVisible();
    await page.getByLabel("Buscar en catálogo guardado").fill("cafe");
    await expect(page.getByRole("region", { name: "Productos guardados" })).toContainText(
      CATALOGO[0].nombre,
    );
    await expect(page.getByRole("button", { name: /Cobrar/ })).toHaveCount(0);
    for (const width of [360, 768, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
      ).toBe(true);
      await page.screenshot({ path: `/tmp/gaes-readonly-${width}.png`, fullPage: true });
    }
    await page.unroute("**/api/**");
    await page.getByRole("button", { name: "Verificar conexión" }).click();
    await expect(status).toContainText("Catálogo guardado en este equipo");
    await status.getByRole("button", { name: "Actualizar catálogo" }).click();
    await expect(status).toContainText("Catálogo guardado en este equipo");
    expect(readActive()[0]?.value).not.toBe(original);
    await page.getByRole("button", { name: "Salir", exact: true }).click();
    await expect(status).toHaveCount(0);
    await expect(page.getByLabel("Correo")).toBeVisible();
  } finally {
    await context.setOffline(false);
    rmSync(directory, { recursive: true, force: true });
  }
});
