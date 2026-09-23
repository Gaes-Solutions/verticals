import { type AudioPlayer, createAudioPlayer, setAudioModeAsync } from "expo-audio";
import * as Haptics from "expo-haptics";
import beepWav from "../../assets/beep.wav";

let player: AudioPlayer | null = null;

function playBeep(): void {
  try {
    if (!player) {
      player = createAudioPlayer(beepWav);
      // Un kiosko debe sonar aunque el dispositivo esté en silencio.
      void setAudioModeAsync({ playsInSilentMode: true }).catch(() => {});
    }
    // Re-entrante: si el beep anterior aún suena, se reinicia desde el inicio
    // en vez de cortarse o tronar por dos escaneos seguidos.
    if (player.playing) void player.seekTo(0).catch(() => {});
    player.play();
  } catch {
    // El feedback nunca debe romper el flujo de escaneo.
  }
}

/**
 * Feedback de escaneo exitoso tipo verificador de precios: beep corto +
 * vibración de éxito. Con `sonidoBeep = false` solo vibra.
 * Nunca lanza: un fallo de audio o haptics se ignora silenciosamente.
 */
export function feedbackScanExito(sonidoBeep = true): void {
  try {
    if (sonidoBeep) playBeep();
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
  } catch {
    // El feedback nunca debe romper el flujo de escaneo.
  }
}
