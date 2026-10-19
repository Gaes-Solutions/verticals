import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App as PosApp } from "../../web-pos/src/App.js";
import { Login as PosLogin } from "../../web-pos/src/components/Login.js";
import { App as PlatformApp } from "../../web-superadmin/src/App.js";
import { Login as PlatformLogin } from "../../web-superadmin/src/components/Login.js";
import { App as AdminApp } from "../src/App.js";
import { Login as AdminLogin } from "../src/components/Login.js";
const write = vi.fn();
const remove = vi.fn();
beforeEach(() => {
  vi.stubGlobal("React", React);
  vi.stubGlobal("localStorage", {
    getItem() {
      throw new DOMException("Denied", "SecurityError");
    },
    setItem: write,
    removeItem: remove,
  });
  write.mockClear();
  remove.mockClear();
});
afterEach(() => vi.unstubAllGlobals());
const cases = [
  { name: "admin App", render: () => renderToStaticMarkup(React.createElement(AdminApp)) },
  {
    name: "admin Login",
    render: () => renderToStaticMarkup(React.createElement(AdminLogin, { onLogin() {} })),
  },
  { name: "POS App", render: () => renderToStaticMarkup(React.createElement(PosApp)) },
  {
    name: "POS Login",
    render: () => renderToStaticMarkup(React.createElement(PosLogin, { onLogin() {} })),
  },
  { name: "platform App", render: () => renderToStaticMarkup(React.createElement(PlatformApp)) },
  {
    name: "platform Login",
    render: () => renderToStaticMarkup(React.createElement(PlatformLogin, { onLogin() {} })),
  },
];
describe("session storage failure", () => {
  it.each(cases)(
    "$name blocks startup access explicitly instead of assuming no session",
    ({ render }) => {
      const html = render();
      expect(html).toContain('role="alert"');
      expect(html).toContain("No podemos acceder al almacenamiento del navegador");
      expect(html).toContain("Reintentar acceso");
      expect(html).not.toContain('type="password"');
      expect(write).not.toHaveBeenCalled();
      expect(remove).not.toHaveBeenCalled();
    },
  );
});
