import type { KeyboardEvent } from "react";

/** Keyboard selection for the rich button cards used as ARIA radios. */
export function navegarRadios(event: KeyboardEvent<HTMLDivElement>) {
  if (event.altKey || event.ctrlKey || event.metaKey) return;
  const direction = ["ArrowDown", "ArrowRight"].includes(event.key)
    ? 1
    : ["ArrowUp", "ArrowLeft"].includes(event.key)
      ? -1
      : 0;
  if (!direction && event.key !== "Home" && event.key !== "End") return;
  const group = event.currentTarget;
  const radios = Array.from(group.querySelectorAll<HTMLButtonElement>('button[role="radio"]'))
    .filter(
      (radio) => !radio.matches(":disabled") && radio.getAttribute("aria-disabled") !== "true",
    )
    .filter((radio) => radio.closest('[role="radiogroup"]') === group);
  const current = radios.findIndex((radio) => radio === document.activeElement);
  if (current < 0 || !radios.length) return;
  const next =
    event.key === "Home"
      ? 0
      : event.key === "End"
        ? radios.length - 1
        : (current + direction + radios.length) % radios.length;
  event.preventDefault();
  radios[next]?.focus();
  radios[next]?.click();
}
