import {
  botDefinitionExample,
  createBattleSession,
  createInitialTankState,
  fixedMaps,
  getBattleSnapshot,
  stepBattleSession,
  type MatchSnapshot,
  type TankIntent
} from "@tank-bot-battle/shared";

export type SandboxScriptSegment = {
  frames: number;
  intent: TankIntent;
};

const SANDBOX_PREVIEW_TICKS = 180;

function expandScript(segments: SandboxScriptSegment[]): TankIntent[] {
  return segments.flatMap((segment) => Array.from({ length: segment.frames }, () => segment.intent));
}

export function simulateSandbox(segments: SandboxScriptSegment[]): MatchSnapshot[] {
  const map = fixedMaps[0];
  const session = createBattleSession({
    map,
    seed: `sandbox-${segments.length}`,
    tanks: [
      createInitialTankState({
        id: "player",
        name: "Player",
        position: map.spawnPoints[0],
        rotation: 0,
        isManual: true,
        manualScript: expandScript(segments)
      }),
      createInitialTankState({
        id: "bot",
        name: "Sample Bot",
        position: map.spawnPoints[1],
        rotation: Math.PI,
        isManual: false,
        bot: botDefinitionExample
      })
    ]
  });

  session.replay.push(getBattleSnapshot(session));

  while (!session.completed && session.tick < SANDBOX_PREVIEW_TICKS) {
    stepBattleSession(session);
  }

  return session.replay;
}
