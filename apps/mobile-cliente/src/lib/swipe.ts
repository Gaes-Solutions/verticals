/** Horizontal intent stays separate from scrolling and cancelled/multitouch gestures. */
export function swipeIntent(dx: number, dy: number, touches: number): boolean {
  return touches === 1 && dx > 12 && dx > Math.abs(dy) * 1.6;
}
export function swipeComplete(dx: number, dy: number, width: number, cancelled: boolean): boolean {
  const threshold = Math.max(48, Math.min(80, width * 0.3));
  return !cancelled && dx >= threshold && dx > Math.abs(dy) * 1.6;
}
