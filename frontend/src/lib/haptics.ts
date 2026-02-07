export function vibrateShort() {
  navigator.vibrate?.(15);
}

export function vibrateDouble() {
  navigator.vibrate?.([10, 50, 10]);
}

export function vibrateMedium() {
  navigator.vibrate?.(25);
}
