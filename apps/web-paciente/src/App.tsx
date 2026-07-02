import { useState } from "react";
import { LoginOtp } from "./components/LoginOtp.js";
import { Portal } from "./components/Portal.js";
import { type SesionPaciente, loadToken, setToken } from "./lib/api.js";

export function App() {
  const [nombre, setNombre] = useState<string | null>(() =>
    loadToken() ? (localStorage.getItem("gaespos_paciente_nombre") ?? "Paciente") : null,
  );

  function entrar(ses: SesionPaciente) {
    setToken(ses.accessToken);
    localStorage.setItem("gaespos_paciente_nombre", ses.patient.nombre);
    setNombre(ses.patient.nombre);
  }

  function salir() {
    setToken(null);
    localStorage.removeItem("gaespos_paciente_nombre");
    setNombre(null);
  }

  if (!nombre) return <LoginOtp onLogin={entrar} />;
  return <Portal nombre={nombre} onLogout={salir} />;
}
