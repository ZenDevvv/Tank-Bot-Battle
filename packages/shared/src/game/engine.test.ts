import { botDefinitionExample } from "../schema/bot.js";
import { FIRE_COOLDOWN_TICKS } from "./constants.js";
import { createInitialTankState, simulateMatch } from "./engine.js";
import { fixedMaps } from "./maps.js";

describe("simulateMatch", () => {
  it("produces a deterministic replay for the same bots and map", () => {
    const run = () => simulateMatch({
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
    });

    expect(run()).toEqual(run());
  });

  it("supports fire cooldown and replay generation", () => {
    const result = simulateMatch({
      map: fixedMaps[1],
      seed: "cooldown",
      tanks: [
        createInitialTankState({
          id: "alpha",
          name: "Alpha",
          position: fixedMaps[1].spawnPoints[0],
          rotation: 0,
          isManual: false,
          bot: {
            ...botDefinitionExample,
            rules: [
              {
                id: "always-fire",
                priority: 999,
                when: [
                  { type: "cooldownReady", operator: "equals", value: true }
                ],
                then: [{ type: "fire" }]
              },
              {
                id: "idle",
                priority: 1,
                when: [
                  { type: "enemyVisible", operator: "equals", value: false }
                ],
                then: [{ type: "stop" }]
              }
            ]
          }
        }),
        createInitialTankState({
          id: "beta",
          name: "Beta",
          position: fixedMaps[1].spawnPoints[1],
          rotation: Math.PI,
          isManual: false,
          bot: botDefinitionExample
        })
      ]
    });

    expect(result.replay.length).toBeGreaterThan(1);
    expect(result.finalState.tanks[0]?.cooldownTicks).toBeLessThanOrEqual(FIRE_COOLDOWN_TICKS);
  });
});
