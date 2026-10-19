import { describe, expect, it } from "vitest";
import { sanitizePolicyHtml } from "../src/lib/policy-html";

describe("editable policy HTML", () => {
  it.each([
    "javascript:alert(1)",
    "java&#x73;cript:alert(1)",
    "javascript&#58;alert(1)",
    "&#106;&#97;&#118;&#97;&#115;&#99;&#114;&#105;&#112;&#116;&#58;alert(1)",
    "JaVaScRiPt:alert(1)",
    "  javascript:alert(1)",
    "&#x09;java&#x0a;script:alert(1)",
    "java\tscript:alert(1)",
    "java\r\nscript:alert(1)",
    "\u0001javascript:alert(1)",
    "vbscript:msgbox(1)",
    "data:text/html,<script>alert(1)</script>",
    "file:///tmp/private",
    "//outside.test/path",
    "\\\\outside.test/path",
    "/\\outside.test/path",
    "&#47;&#47;outside.test/path",
  ])("removes unsafe or protocol-relative links: %s", (href) => {
    expect(sanitizePolicyHtml(`<a href="${href}" title="Consulta">enlace</a>`)).toBe(
      '<a title="Consulta">enlace</a>',
    );
  });
  it.each([
    "<a href=java&#x73;cript:alert(1)>enlace</a>",
    '<a/href="javascript&#58;alert(1)" onclick=alert(1)>enlace</a>',
    '<a href="javascript:alert(1)" href="https://safe.test">enlace</a>',
    '<a href="https://safe.test" href="javascript:alert(1)" onclick="alert(1)">enlace</a>',
    '<svg><a xlink:href="javascript:alert(1)">enlace</a></svg>',
    "<math><mtext><img src=x onerror=alert(1)></mtext></math>",
    '<p><a href="javascript:alert(1)">enlace</p></a>',
    "<textarea>&lt;img src=x onerror=alert(1)&gt;</textarea>",
    "<option>&lt;script&gt;alert(1)&lt;/script&gt;</option>",
  ])("normalizes malformed markup without retaining active attributes", (input) => {
    const result = sanitizePolicyHtml(input);
    expect(result).not.toMatch(/javascript:|onerror|onclick|xlink:|<svg|<math|<img|<script/i);
  });

  it.each([
    "<svg><textarea></textarea/><img src=x onerror=alert(1)></svg>",
    "<math><xmp></xmp/><img src=x onerror=alert(1)></math>",
    "<xmp><img src=x onerror=alert(1)></xmp>",
  ])("does not re-emit live tags from foreign/raw-text parsing edge cases", (input) => {
    expect(sanitizePolicyHtml(input)).not.toMatch(
      /<(?:img|script|svg|math|xmp|textarea)(?:\s|\/?>)/i,
    );
  });
  it("keeps the complete presentation allowlist but strips all presentation attributes", () => {
    const input =
      '<h2 id="x">Envíos</h2><h3 style="color:red">Condiciones</h3><p class="x" onclick="alert(1)">Texto<br><strong>fuerte</strong><em>énfasis</em><u>subrayado</u></p><ul><li>uno</li></ul><ol><li>dos</li></ol>';
    expect(sanitizePolicyHtml(input)).toBe(
      "<h2>Envíos</h2><h3>Condiciones</h3><p>Texto<br /><strong>fuerte</strong><em>énfasis</em><u>subrayado</u></p><ul><li>uno</li></ul><ol><li>dos</li></ol>",
    );
  });
  it.each([
    "https://safe.test/ayuda?q=uno&otro=dos",
    "http://safe.test",
    "mailto:help@safe.test",
    "tel:+525555555555",
    "/contacto",
    "#condiciones",
  ])("preserves legitimate destinations %s", (href) => {
    expect(
      sanitizePolicyHtml(
        `<a href="${href}" title="Ayuda" target="_blank" style="color:red" onmouseover="alert(1)">Consulta</a>`,
      ),
    ).toBe(`<a href="${href.replaceAll("&", "&amp;")}" title="Ayuda">Consulta</a>`);
  });
  it("discards active embedded content and comments without discarding legal text", () => {
    expect(
      sanitizePolicyHtml(
        '<p>Antes</p><!--comentario--><script>alert(1)</script><style>body{display:none}</style><iframe><p>oculto</p></iframe><form><input name="password"><button>Enviar</button></form><p>Después</p>',
      ),
    ).toBe("<p>Antes</p><p>Después</p>");
  });
  it("escapes plain text and entities safely", () => {
    expect(sanitizePolicyHtml("Envíos & devoluciones: 3 < 5.\nConsulta aquí.")).toBe(
      "Envíos &amp; devoluciones: 3 &lt; 5.\nConsulta aquí.",
    );
  });
});
