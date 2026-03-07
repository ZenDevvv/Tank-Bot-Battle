import { botDefinitionExample } from "../schema/bot.js";
import { createBattleSession, createInitialTankState, finishBattleSession, stepBattleSession } from "./engine.js";
import { fixedMaps } from "./maps.js";
import type { ArenaMap } from "./types.js";

const openDuelMap: ArenaMap = {
  id: "open-duel",
  name: "Open Duel",
  width: 640,
  height: 320,
  spawnPoints: [
    { x: 120, y: 160 },
    { x: 520, y: 160 }
  ],
  walls: []
};

describe("battle session engine", () => {
  it("produces deterministic results when seeded the same way", () => {
    const run = () => finishBattleSession(createBattleSession({
      map: fixedMaps[0],
      seed: "seed-1",
      tanks: [
        createInitialTankState({
          id: "alpha",
          name: "Alpha",
          position: fixedMaps[0].spawnPoints[0],
          rotation: 0,
          isManual: false,
          bot: botDefinitionExample
        }),
        createInitialTankState({
          id: "beta",
          name: "Beta",
          position: fixedMaps[0].spawnPoints[1],
          rotation: Math.PI,
          isManual: false,
          bot: botDefinitionExample
        })
      ]
    }));

    expect(run()).toEqual(run());
  });

  it("advances incrementally and records replay frames", () => {
    const session = createBattleSession({
      map: fixedMaps[0],
      seed: "incremental",
      tanks: [
        createInitialTankState({
          id: "alpha",
          name: "Alpha",
          position: fixedMaps[0].spawnPoints[0],
          rotation: 0,
          isManual: false,
          bot: botDefinitionExample
        }),
        createInitialTankState({
          id: "beta",
          name: "Beta",
          position: fixedMaps[0].spawnPoints[1],
          rotation: Math.PI,
          isManual: false,
          bot: botDefinitionExample
        })
      ]
    });

    const firstTick = stepBattleSession(session);

    expect(firstTick.tick).toBe(1);
    expect(session.replay.length).toBe(1);
    expect(session.completed).toBe(false);
  });

  it("keeps an empty bot inert", () => {
    const session = createBattleSession({
      map: fixedMaps[0],
      seed: "idle-bot",
      tanks: [
        createInitialTankState({
          id: "alpha",
          name: "Alpha",
          position: fixedMaps[0].spawnPoints[0],
          rotation: 0,
          isManual: false,
          bot: {
            name: "Idle",
            version: "1.0.0",
            goals: []
          }
        }),
        createInitialTankState({
          id: "beta",
          name: "Beta",
          position: fixedMaps[0].spawnPoints[1],
          rotation: Math.PI,
          isManual: false,
          bot: {
            name: "Idle 2",
            version: "1.0.0",
            goals: []
          }
        })
      ]
    });

    for (let tick = 0; tick < 15; tick += 1) {
      stepBattleSession(session);
    }

    expect(session.tanks[0].position).toEqual(fixedMaps[0].spawnPoints[0]);
    expect(session.tanks[1].position).toEqual(fixedMaps[0].spawnPoints[1]);
    expect(session.bullets).toHaveLength(0);
  });

  it("fires shots quickly on an open map instead of orbiting forever", () => {
    const session = createBattleSession({
      map: openDuelMap,
      seed: "open-pressure",
      tanks: [
        createInitialTankState({
          id: "alpha",
          name: "Alpha",
          position: openDuelMap.spawnPoints[0],
          rotation: 0,
          isManual: false,
          bot: botDefinitionExample
        }),
        createInitialTankState({
          id: "beta",
          name: "Beta",
          position: openDuelMap.spawnPoints[1],
          rotation: Math.PI,
          isManual: false,
          bot: botDefinitionExample
        })
      ]
    });

    let fired = false;

    for (let tick = 0; tick < 40; tick += 1) {
      const snapshot = stepBattleSession(session);
      if (snapshot.bullets.length > 0) {
        fired = true;
        break;
      }
    }

    expect(fired).toBe(true);
  });

  it("pursues contact on a blocked map and eventually generates a firing opportunity", () => {
    const session = createBattleSession({
      map: fixedMaps[0],
      seed: "search-and-engage",
      tanks: [
        createInitialTankState({
          id: "alpha",
          name: "Alpha",
          position: fixedMaps[0].spawnPoints[0],
          rotation: 0,
          isManual: false,
          bot: botDefinitionExample
        }),
        createInitialTankState({
          id: "beta",
          name: "Beta",
          position: fixedMaps[0].spawnPoints[1],
          rotation: Math.PI,
          isManual: false,
          bot: botDefinitionExample
        })
      ]
    });

    let sawBullet = false;
    for (let tick = 0; tick < 220; tick += 1) {
      const snapshot = stepBattleSession(session);
      if (snapshot.bullets.length > 0) {
        sawBullet = true;
        break;
      }
    }

    expect(sawBullet).toBe(true);
  });

  it("destroys both bullets and records an impact effect when shots collide", () => {
    const session = createBattleSession({
      map: openDuelMap,
      seed: "bullet-clash",
      tanks: [
        createInitialTankState({
          id: "alpha",
          name: "Alpha",
          position: openDuelMap.spawnPoints[0],
          rotation: 0,
          isManual: true,
          manualScript: [{ throttle: 0, steer: 0, fire: true }]
        }),
        createInitialTankState({
          id: "beta",
          name: "Beta",
          position: openDuelMap.spawnPoints[1],
          rotation: Math.PI,
          isManual: true,
          manualScript: [{ throttle: 0, steer: 0, fire: true }]
        })
      ]
    });

    let clashTick = -1;

    for (let tick = 0; tick < 40; tick += 1) {
      const snapshot = stepBattleSession(session);
      if (snapshot.effects.length > 0) {
        clashTick = snapshot.tick;
        expect(snapshot.effects[0]?.kind).toBe("bulletClash");
        expect(snapshot.bullets).toHaveLength(0);
        break;
      }
    }

    expect(clashTick).toBeGreaterThan(0);
    expect(session.tanks[0].health).toBe(3);
    expect(session.tanks[1].health).toBe(3);
  });
});
