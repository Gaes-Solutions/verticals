/** Browser-only keyboard traversal. Caller supplies an existing authenticated page. No requests or writes are initiated by this helper. */
async function auditKeyboardPage(page, name, { coverage = [], findings = [] } = {}) {
  const record = (condition, message) => {
    if (!condition) findings.push(message);
  };
  const labels = await page.locator("input:not([type=hidden]),select,textarea").evaluateAll((es) =>
    es
      .filter((e) => e.getClientRects().length && !e.disabled)
      .map((e) => ({
        type: e.type,
        label:
          e.getAttribute("aria-label") ||
          e.getAttribute("aria-labelledby") ||
          Array.from(e.labels || [], (l) => l.textContent.trim()).join(" "),
      })),
  );
  record(
    labels.every((e) => e.label),
    `${name}: unlabelled visible input`,
  );
  const stops = [];
  await page.evaluate(() => {
    document.body.tabIndex = -1;
    document.body.focus();
    document.body.removeAttribute("tabindex");
  });
  for (let i = 0; i < 160; i++) {
    await page.keyboard.press("Tab");
    const entry = await page.evaluate(() => {
      const e = document.activeElement;
      if (e === document.body) return null;
      if (!e.dataset.qaFocusId) {
        window.__qaFocusIndex = (window.__qaFocusIndex || 0) + 1;
        e.dataset.qaFocusId = String(window.__qaFocusIndex);
      }
      const ancestors = [e, e.parentElement, e.parentElement?.parentElement].filter(Boolean);
      const indicator = ancestors.some((x) => {
        const c = getComputedStyle(x);
        return (
          (c.outlineStyle !== "none" && Number.parseFloat(c.outlineWidth) > 0) ||
          c.boxShadow !== "none"
        );
      });
      return {
        id: e.dataset.qaFocusId,
        name:
          e.getAttribute("aria-label") || e.textContent.trim().slice(0, 100) || e.name || e.type,
        indicator,
        visible: e.getClientRects().length > 0,
        focusVisible: e.matches(":focus-visible"),
        last:
          e ===
          Array.from(
            document.querySelectorAll("a[href],button,input,select,textarea,summary,[tabindex]"),
          )
            .filter((x) => x.tabIndex >= 0 && !x.matches(":disabled") && x.getClientRects().length)
            .at(-1),
      };
    });
    if (!entry) continue;
    if (stops.some((e) => e.id === entry.id)) {
      record(entry.id === stops[0]?.id, `${name}: unexpected focus cycle`);
      break;
    }
    stops.push(entry);
    record(
      entry.visible && entry.focusVisible && entry.indicator,
      `${name}: focus indicator absent: ${entry.name}`,
    );
    if (entry.last) break;
  }
  record(stops.length > 0 && stops.length < 160, `${name}: incomplete Tab traversal`);
  // Reverse before browser chrome: returning from chrome triggers legitimate
  // account/session rechecks that replace controls while traversal is running.
  for (const expected of stops.slice(0, -1).reverse()) {
    let actual;
    for (let i = 0; i < 3; i++) {
      await page.keyboard.press("Shift+Tab");
      actual = await page.evaluate(() => document.activeElement.dataset.qaFocusId);
      if (actual) break;
    }
    record(
      actual === expected.id,
      `${name}: Shift+Tab order differs at ${expected.name} (${expected.id} vs ${actual})`,
    );
  }
  coverage.push({ name, tabStops: stops.length, labelledInputs: labels.length });
  return { coverage, findings };
}

module.exports = { auditKeyboardPage };
