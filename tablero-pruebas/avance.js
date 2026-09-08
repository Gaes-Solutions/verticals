const labels = {
  pendiente: "Pendiente",
  "en-desarrollo": "En desarrollo",
  "en-revision": "En revisión",
  probada: "Probada",
  fallo: "Falló",
  dependencia: "Requiere equipo o acceso",
};
let previous = "";
let inFlight = false;
function node(tag, text, className) {
  const element = document.createElement(tag);
  if (text !== undefined) element.textContent = text;
  if (className) element.className = className;
  return element;
}
function render(data) {
  const expanded = new Set([...document.querySelectorAll("details[open]")].map((d) => d.id));
  document.getElementById("current-title").textContent = data.current;
  document.getElementById("current-detail").textContent = data.detail;
  const date = new Date(data.updated);
  document.getElementById("updated").textContent = `Actualizado: ${date.toLocaleString("es-MX")}`;
  document.getElementById("updated").dateTime = data.updated;
  document.getElementById("done").textContent = data.tasks.filter(
    (t) => t.status === "probada",
  ).length;
  document.getElementById("active").textContent = data.tasks.filter((t) =>
    ["en-desarrollo", "en-revision"].includes(t.status),
  ).length;
  document.getElementById("pending").textContent = data.tasks.filter(
    (t) => !["probada", "en-desarrollo", "en-revision"].includes(t.status),
  ).length;
  const fragment = document.createDocumentFragment();
  for (const task of data.tasks) {
    const details = node("details", undefined, "task gx-card");
    details.id = task.id;
    details.open = expanded.has(task.id);
    const summary = node("summary");
    const title = node("span", task.title, "task-title");
    title.append(node("span", `${task.id} · ${task.owner}`, "task-id"));
    summary.append(title, node("span", labels[task.status] || "Pendiente", `pill ${task.status}`));
    details.append(summary);
    const content = node("div", undefined, "details");
    content.append(node("p", task.description));
    const gates = node("div", undefined, "gates");
    for (const [label, value] of [
      ["Seguridad", task.security],
      ["Pantallas", task.responsive],
      ["Errores", task.errors],
    ]) {
      const gate = node("div", undefined, "gate");
      gate.append(node("b", label), node("span", value));
      gates.append(gate);
    }
    content.append(gates, node("b", "Evidencia y siguiente paso"));
    const evidence = node("ul", undefined, "evidence");
    for (const item of task.evidence) evidence.append(node("li", item));
    content.append(evidence);
    details.append(content);
    fragment.append(details);
  }
  document.getElementById("tasks").replaceChildren(fragment);
}
async function refresh() {
  if (inFlight) return;
  inFlight = true;
  const connection = document.getElementById("connection");
  try {
    const response = await fetch("/estado-avance.json", {
      cache: "no-store",
      signal: AbortSignal.timeout(4000),
    });
    if (!response.ok) throw new Error("No disponible");
    const raw = await response.text();
    const data = JSON.parse(raw);
    if (!Array.isArray(data.tasks) || !data.updated) throw new Error("Estado inválido");
    if (raw !== previous) {
      render(data);
      previous = raw;
    }
    connection.textContent = "Tablero conectado";
    connection.className = "";
    const recent =
      Number.isFinite(Date.parse(data.updated)) && Date.now() - Date.parse(data.updated) < 90000;
    document.getElementById("activity").textContent =
      data.activity === "paused"
        ? "Trabajo pausado"
        : data.activity === "working" && recent
          ? "Trabajo en curso · actualización reciente"
          : "Sin actualización reciente · actividad por confirmar";
  } catch {
    document.getElementById("activity").textContent = "Actividad sin confirmar";
    connection.textContent =
      "Sin conexión al seguimiento · El último estado puede estar desactualizado";
    connection.className = "stale";
  } finally {
    inFlight = false;
  }
}
refresh();
setInterval(refresh, 5000);
