import type { BotDefinition, MatchSnapshot } from "@tank-bot-battle/shared";

export type AuthUser = {
  id: string;
  username: string;
  email: string;
};

export type BotRecord = {
  id: string;
  ownerId: string | null;
  name: string;
  version: string;
  author?: string;
  isSystem: boolean;
  definition: BotDefinition;
};

export type MapRecord = {
  id: string;
  name: string;
  width: number;
  height: number;
  spawnPoints: Array<{ x: number; y: number }>;
  walls: Array<{ x: number; y: number; width: number; height: number }>;
};

export type MatchRecord = {
  id: string;
  leftBotId: string;
  rightBotId: string;
  mapId: string;
  winnerTankId: string | null;
  reason: string;
  totalTicks: number;
  createdAt: string;
};

export type ReplayRecord = {
  id: string;
  replay: MatchSnapshot[];
};

export type BattlefieldMode = "live" | "result" | "replay" | "replayComplete";

export type ReplaySpeed = 0.25 | 0.5 | 1 | 2 | 4;

export type BattleOutcome = {
  winnerTankId: string | null;
  winnerName: string | null;
  leftTankName: string;
  rightTankName: string;
  reason: string;
  totalTicks: number;
  mapId: string;
  source: "liveResult" | "savedReplay";
};

export type LastLiveMatchConfig = {
  leftBotId: string;
  rightBotId: string;
  mapId: string;
};
