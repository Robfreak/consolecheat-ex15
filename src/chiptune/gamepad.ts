// Gamepad input, polled once per animation frame. Pure helpers so they can be tested with mocks.
// Standard mapping: 0 = Cross/A, 4 = L1, 5 = R1, 9 = Options/Start, 12–15 = D-pad up/down/left/right.

export const DEADZONE = 0.5;

export type PadAction = "up" | "down" | "left" | "right" | "toggle" | "play" | "prevTrack" | "nextTrack";

export const BUTTON_ACTIONS: Record<number, PadAction> = {
  0: "toggle",
  4: "prevTrack",
  5: "nextTrack",
  9: "play",
  12: "up",
  13: "down",
  14: "left",
  15: "right",
};

export type PadLike = {
  connected?: boolean;
  buttons: readonly { pressed: boolean; value?: number }[];
  axes: readonly number[];
};

/** Pressed state of buttons 0–15. The left stick counts as the D-pad beyond the dead zone. */
export function readButtons(pad: PadLike): boolean[] {
  const out = Array.from({ length: 16 }, (_, i) => {
    const button = pad.buttons[i];
    return !!button && (button.pressed || (button.value ?? 0) > 0.5);
  });
  const x = pad.axes[0] ?? 0;
  const y = pad.axes[1] ?? 0;
  if (y < -DEADZONE) out[12] = true;
  if (y > DEADZONE) out[13] = true;
  if (x < -DEADZONE) out[14] = true;
  if (x > DEADZONE) out[15] = true;
  return out;
}

/** Buttons that went from released to pressed since the last frame. */
export function risingEdges(prev: readonly boolean[], next: readonly boolean[]): number[] {
  const out: number[] = [];
  for (let i = 0; i < next.length; i += 1) if (next[i] && !prev[i]) out.push(i);
  return out;
}

export function edgeActions(prev: readonly boolean[], next: readonly boolean[]): PadAction[] {
  return risingEdges(prev, next)
    .map((index) => BUTTON_ACTIONS[index])
    .filter((action): action is PadAction => action !== undefined);
}

/** The first connected pad from navigator.getGamepads(), or null. */
export function firstPad(pads: readonly (PadLike | null)[] | null | undefined): PadLike | null {
  if (!pads) return null;
  for (const pad of pads) if (pad && pad.connected !== false) return pad;
  return null;
}
