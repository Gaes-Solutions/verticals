import { beforeEach, describe, expect, it, vi } from "vitest";

const { createAudioPlayer, notificationAsync, player, setAudioModeAsync } = vi.hoisted(() => {
  const player = {
    playing: false,
    play: vi.fn(),
    seekTo: vi.fn(() => Promise.resolve()),
    remove: vi.fn(),
  };
  return {
    player,
    createAudioPlayer: vi.fn(() => player),
    setAudioModeAsync: vi.fn(() => Promise.resolve()),
    notificationAsync: vi.fn(() => Promise.resolve()),
  };
});

vi.mock("expo-audio", () => ({ createAudioPlayer, setAudioModeAsync }));
vi.mock("expo-haptics", () => ({
  NotificationFeedbackType: { Success: "success" },
  notificationAsync,
}));

async function loadFeedbackScanExito() {
  // El servicio guarda su player como singleton de módulo: se recarga para
  // que cada caso arranque sin estado acumulado.
  vi.resetModules();
  const mod = await import("../src/services/feedback-scan");
  return mod.feedbackScanExito;
}

const flushMicrotasks = () => new Promise((resolve) => setTimeout(resolve, 0));

beforeEach(() => {
  vi.clearAllMocks();
  player.playing = false;
});

describe("feedbackScanExito", () => {
  it("beeps and vibrates on a successful scan when sonidoBeep is on", async () => {
    const feedbackScanExito = await loadFeedbackScanExito();
    feedbackScanExito(true);
    expect(createAudioPlayer).toHaveBeenCalledTimes(1);
    expect(setAudioModeAsync).toHaveBeenCalledWith({ playsInSilentMode: true });
    expect(player.play).toHaveBeenCalledTimes(1);
    expect(player.seekTo).not.toHaveBeenCalled();
    expect(notificationAsync).toHaveBeenCalledWith("success");
    await flushMicrotasks();
  });

  it("defaults to beeping when no config value is passed", async () => {
    const feedbackScanExito = await loadFeedbackScanExito();
    feedbackScanExito();
    expect(createAudioPlayer).toHaveBeenCalledTimes(1);
    expect(player.play).toHaveBeenCalledTimes(1);
    expect(notificationAsync).toHaveBeenCalledWith("success");
  });

  it("only vibrates when sonidoBeep is off", async () => {
    const feedbackScanExito = await loadFeedbackScanExito();
    feedbackScanExito(false);
    expect(createAudioPlayer).not.toHaveBeenCalled();
    expect(player.play).not.toHaveBeenCalled();
    expect(notificationAsync).toHaveBeenCalledWith("success");
  });

  it("restarts the beep instead of breaking on rapid double scans", async () => {
    const feedbackScanExito = await loadFeedbackScanExito();
    feedbackScanExito(true);
    player.playing = true;
    feedbackScanExito(true);
    expect(player.play).toHaveBeenCalledTimes(2);
    expect(player.seekTo).toHaveBeenCalledWith(0);
    expect(createAudioPlayer).toHaveBeenCalledTimes(1);
  });

  it("never throws when audio or haptics fail", async () => {
    const feedbackScanExito = await loadFeedbackScanExito();
    createAudioPlayer.mockImplementationOnce(() => {
      throw new Error("audio native module missing");
    });
    expect(() => feedbackScanExito(true)).not.toThrow();
    notificationAsync.mockRejectedValueOnce(new Error("haptics unavailable"));
    expect(() => feedbackScanExito(true)).not.toThrow();
    await flushMicrotasks();
    expect(notificationAsync).toHaveBeenCalledTimes(2);
  });
});
