type HapticPattern = "light" | "medium" | "heavy" | "success" | "levelUp" | "notification";

const PATTERNS: Record<HapticPattern, number | number[]> = {
  light: 10,
  medium: 25,
  heavy: 50,
  success: [15, 50, 30],
  levelUp: [20, 40, 30, 40, 50],
  notification: [15, 30, 15],
};

let hapticEnabled = true;

export function setHapticEnabled(enabled: boolean) {
  hapticEnabled = enabled;
}

export function isHapticSupported(): boolean {
  return typeof navigator !== "undefined" && "vibrate" in navigator;
}

export function triggerHaptic(pattern: HapticPattern = "medium") {
  if (!hapticEnabled || !isHapticSupported()) return;
  try {
    navigator.vibrate(PATTERNS[pattern]);
  } catch {}
}

export function hapticMissionComplete() {
  triggerHaptic("success");
}

export function hapticLevelUp() {
  triggerHaptic("levelUp");
}

export function hapticNotification() {
  triggerHaptic("notification");
}

export function hapticTap() {
  triggerHaptic("light");
}
