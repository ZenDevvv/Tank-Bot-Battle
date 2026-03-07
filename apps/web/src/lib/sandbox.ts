import { botDefinitionExample, createInitialTankState, fixedMaps, simulateMatch, type TankCommand } from "@tank-bot-battle/shared";
import type { MatchSnapshot } from "@tank-bot-battle/shared";

export function simulateSandbox(commands: TankCommand[]): MatchSnapshot[] {
  const map = fixedMaps[0];
  const manualTank = createInitialTankState({
    id: "player",
    name: "Player",
    position: map.spawnPoints[0],
    rotation: 0,
    isManual: true
  });
  manualTank.commandQueue = commands;
  const sampleBot = createInitialTankState({
    id: "bot",
    name: "Sample Bot",
    position: map.spawnPoints[1],
    rotation: Math.PI,
    isManual: false,
    bot: botDefinitionExample
  });

  return simulateMatch({
    map,
    seed: "sandbox",
    tanks: [manualTank, sampleBot]
  }).replay;
}
