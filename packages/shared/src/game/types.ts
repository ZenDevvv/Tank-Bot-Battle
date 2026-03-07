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

export type TankThrottle = -1 | 0 | 1;
export type TankSteer = -1 | 0 | 1;

export type TankIntent = {
  throttle: TankThrottle;
  steer: TankSteer;
  fire: boolean;
};

export type TankAiMemory = {
  activeGoalId: string | null;
  activeGoalTicks: number;
  stalledTicks: number;
  previousEnemyDistance: number | null;
  lastSeenEnemyPosition: Vector2 | null;
  lastSeenEnemyVelocity: Vector2;
  ticksSinceEnemySeen: number;
  searchTurnDirection: TankSteer;
};

export type TankState = {
  id: string;
  name: string;
  position: Vector2;
  lastPosition: Vector2;
  rotation: number;
  health: number;
  cooldownTicks: number;
  intent: TankIntent;
  decisionTicksRemaining: number;
  stuckTimer: number;
  aiMemory: TankAiMemory;
  isManual: boolean;
  bot?: BotDefinition;
  manualScript?: TankIntent[];
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

export type ImpactEffect = {
  id: string;
  kind: "bulletClash";
  position: Vector2;
  ageTicks: number;
  durationTicks: number;
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
  effects: ImpactEffect[];
};

export type MatchReason = "elimination" | "timeout" | "draw";

export type MatchResult = {
  mapId: string;
  totalTicks: number;
  winnerTankId: string | null;
  reason: MatchReason;
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
  enemyAlignment: number;
  enemyDistance: number;
  enemyDistanceBand: "near" | "medium" | "far";
  wallProximity: number;
  wallDistanceBand: "near" | "medium" | "far";
  bulletThreat: boolean;
  bulletThreatLevel: number;
  interceptBearing: number;
  searchBearing: number;
  hasRecentEnemyContact: boolean;
  stalled: boolean;
  ticksSinceEnemySeen: number;
  searchTurnDirection: TankSteer;
  cooldownReady: boolean;
  stuckTimer: number;
  healthRatio: number;
  healthBand: "near" | "medium" | "far";
};

export type BattleSession = {
  map: ArenaMap;
  tanks: [TankState, TankState];
  bullets: BulletState[];
  effects: ImpactEffect[];
  replay: MatchSnapshot[];
  tick: number;
  maxTicks: number;
  winnerTankId: string | null;
  reason: MatchReason | null;
  completed: boolean;
  rng: () => number;
  result?: MatchResult;
};
