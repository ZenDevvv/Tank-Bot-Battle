import type { ReplaySpeed } from "../types";

const BATTLEFIELD_BASE_INTERVAL_MS = 30;
const BATTLEFIELD_MIN_INTERVAL_MS = 8;

export function resolveBattlefieldTickInterval(speed: ReplaySpeed): number {
  return Math.max(BATTLEFIELD_MIN_INTERVAL_MS, Math.round(BATTLEFIELD_BASE_INTERVAL_MS / speed));
}
