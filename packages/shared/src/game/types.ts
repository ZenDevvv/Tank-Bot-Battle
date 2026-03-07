import type { BotDefinition } from "../schema/bot.js";

export type Vector2 = {
  x: number;
  y: number;
};

export type Rect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type ArenaMap = {
  id: string;
  name: string;
  width: number;
  height: number;
  spawnPoints: [Vector2, Vector2];
  walls: Rect[];
};

export type TankCommand =
  | "moveForward"
  | "moveBackward"
  | "turnLeft"
  | "turnRight"
  | "fire"
  | "stop";

export type TankState = {
  id: string;
  name: string;
  position: Vector2;
  rotation: number;
  health: number;
  cooldownTicks: number;
  commandQueue: TankCommand[];
  pendingActionTicks: number;
  isManual: boolean;
  bot?: BotDefinition;
  eliminatedAtTick?: number;
};

export type BulletState = {
  id: string;
  ownerTankId: string;
  position: Vector2;
  velocity: Vector2;
  remainingBounces: number;
  ageTicks: number;
};

export type MatchSnapshot = {
  tick: number;
  tanks: Array<{
    id: string;
    name: string;
    position: Vector2;
    rotation: number;
    health: number;
    cooldownTicks: number;
  }>;
  bullets: BulletState[];
};

export type MatchResult = {
  mapId: string;
  totalTicks: number;
  winnerTankId: string | null;
  reason: "elimination" | "timeout" | "draw";
  replay: MatchSnapshot[];
  finalState: MatchSnapshot;
};

export type EngineInput = {
  map: ArenaMap;
  tanks: [TankState, TankState];
  seed: string;
};

export type BotSensors = {
  enemyVisible: boolean;
  enemyBearing: number;
  enemyDistanceBand: "near" | "medium" | "far";
  wallDistanceBand: "near" | "medium" | "far";
  bulletThreat: boolean;
  cooldownReady: boolean;
  stuckTimer: number;
  healthBand: "near" | "medium" | "far";
};
