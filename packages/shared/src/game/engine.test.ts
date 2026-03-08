import { botDefinitionExample, defaultBotStats, type BotStats } from "../schema/bot.js";
import { createBattleSession, createInitialTankState, stepBattleSession } from "./engine.js";
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

const laneTacticalMap: ArenaMap = {
  id: "lane-tactical",
  name: "Lane Tactical",
  width: 640,
  height: 320,
  spawnPoints: [
    { x: 110, y: 90 },
    { x: 530, y: 230 }
  ],
  walls: [
    { x: 290, y: 40, width: 40, height: 240 }
  ]
};

const liveBattlefieldMap = fixedMaps.find((map) => map.id === "crossfire") ?? openDuelMap;

const ricochetLynxBot = {
  name: "Ricochet Lynx",
  version: "4.0.0",
  stats: {
    forwardSpeed: 78,
    reverseSpeed: 42,
    rotationSpeed: 56,
    fireRate: 64,
    bulletSpeed: 60
  },
  openings: [
    { kind: "fastScout" as const, weight: 2.1 },
    { kind: "centerProbe" as const, weight: 1.8 },
    { kind: "wideFlankRight" as const, weight: 1.4 }
  ],
  tactics: {
    roam: {
      weight: 1.1,
      thresholds: {
        enemyVisible: false,
        minTicksSinceEnemySeen: 16
      }
    },
    investigateLastSeen: {
      weight: 1.5,
      thresholds: {
        enemyVisible: false,
        maxTicksSinceEnemySeen: 90
      }
    },
    takeCover: {
      weight: 0.7,
      thresholds: {
        enemyVisible: true,
        minExposure: 0.5
      }
    },
    peekShot: {
      weight: 1.7,
      thresholds: {
        minCoverScore: 0.15,
        minBankShotOpportunity: 0.2
      }
    },
    flank: {
      weight: 1.9,
      preferredSide: "right" as const,
      thresholds: {
        minFlankOpportunity: 0.24,
        maxTicksSinceEnemySeen: 48
      }
    },
    pressure: {
      weight: 2.3,
      thresholds: {
        minHealthRatio: 0.45
      }
    },
    retreat: {
      weight: 0.8,
      thresholds: {
        enemyVisible: true,
        maxHealthRatio: 0.48
      }
    },
    baitShot: {
      weight: 0.7,
      thresholds: {
        enemyVisible: true,
        minCoverScore: 0.12
      }
    }
  },
  commitment: {
    minPlanTicks: 14,
    maxPlanTicks: 56,
    cooldownTicks: 12,
    replanOnSightChange: true,
    replanOnHit: true,
    replanOnStuck: true
  },
  variance: {
    planJitter: 0.22,
    rerollChance: 0.14,
    openingMix: 0.74
  },
  goals: [
    {
      id: "sweep-hunt",
      type: "reposition" as const,
      priority: 80,
      weightProfile: {
        enemyVisible: -1.2,
        enemyDistance: -1,
        wallProximity: -0.7
      },
      thresholds: {
        enemyVisible: false
      },
      movementProfile: {
        preferredRange: "medium" as const,
        throttleBias: 1,
        turnBias: 0.45,
        orbitBias: 0.15,
        dodgeBias: 0.05,
        engagementDrive: "default" as const,
        reverseBurstTicks: 12,
        reverseHoldTicks: 4
      },
      firePolicy: {
        requiresEnemyVisible: true,
        minUtilityToFire: 100,
        maxBearingOffset: Math.PI / 4,
        fireChance: 0
      },
      noise: {
        scoreJitter: 0.08
      }
    },
    {
      id: "bank-shot-window",
      type: "lineUpShot" as const,
      priority: 94,
      weightProfile: {
        enemyVisible: 1.5,
        enemyAlignment: 2.3,
        cooldownReady: 1.4,
        enemyDistance: 0.7
      },
      thresholds: {
        enemyVisible: true,
        cooldownReady: true,
        enemyBearingAbsLte: Math.PI / 2
      },
      movementProfile: {
        preferredRange: "medium" as const,
        throttleBias: 0.15,
        turnBias: 0.45,
        orbitBias: 0,
        dodgeBias: 0.05,
        engagementDrive: "default" as const,
        reverseBurstTicks: 12,
        reverseHoldTicks: 4
      },
      firePolicy: {
        requiresEnemyVisible: true,
        minUtilityToFire: 93,
        maxBearingOffset: Math.PI / 13,
        fireChance: 0.95
      },
      noise: {
        scoreJitter: 0.07
      }
    },
    {
      id: "close-pressure",
      type: "attack" as const,
      priority: 90,
      weightProfile: {
        enemyVisible: 1.4,
        enemyAlignment: 1.7,
        enemyDistance: 1.2,
        cooldownReady: 1,
        wallProximity: -0.5
      },
      thresholds: {
        enemyVisible: true
      },
      movementProfile: {
        preferredRange: "near" as const,
        throttleBias: 1,
        turnBias: 0.2,
        orbitBias: -0.15,
        dodgeBias: 0.05,
        engagementDrive: "default" as const,
        reverseBurstTicks: 12,
        reverseHoldTicks: 4
      },
      firePolicy: {
        requiresEnemyVisible: true,
        minUtilityToFire: 82,
        maxBearingOffset: Math.PI / 8,
        fireChance: 0.94
      },
      noise: {
        scoreJitter: 0.08
      }
    },
    {
      id: "escape-wall-trap",
      type: "unstick" as const,
      priority: 84,
      weightProfile: {
        stuckTimer: 2.1,
        wallProximity: 1.5
      },
      thresholds: {
        stuckTimerGte: 8
      },
      movementProfile: {
        preferredRange: "far" as const,
        throttleBias: -1,
        turnBias: 0.9,
        orbitBias: 0.8,
        dodgeBias: 0,
        engagementDrive: "default" as const,
        reverseBurstTicks: 12,
        reverseHoldTicks: 4
      },
      firePolicy: {
        requiresEnemyVisible: false,
        minUtilityToFire: 100,
        maxBearingOffset: Math.PI / 4,
        fireChance: 0
      },
      noise: {
        scoreJitter: 0.04
      }
    }
  ]
};

function distanceBetween(left: { x: number; y: number }, right: { x: number; y: number }): number {
  const dx = right.x - left.x;
  const dy = right.y - left.y;
  return Math.sqrt((dx * dx) + (dy * dy));
}

function wallClearance(point: { x: number; y: number }, map: ArenaMap): number {
  const edgeDistances = [
    point.x,
    point.y,
    map.width - point.x,
    map.height - point.y
  ];

  const wallDistances = map.walls.map((wall) => {
    const nearestX = Math.max(wall.x, Math.min(point.x, wall.x + wall.width));
    const nearestY = Math.max(wall.y, Math.min(point.y, wall.y + wall.height));
    const dx = point.x - nearestX;
    const dy = point.y - nearestY;
    return Math.sqrt((dx * dx) + (dy * dy));
  });

  return Math.min(...edgeDistances, ...wallDistances);
}

function normalizeAngle(value: number): number {
  let angle = value;
  while (angle > Math.PI) {
    angle -= Math.PI * 2;
  }
  while (angle < -Math.PI) {
    angle += Math.PI * 2;
  }
  return angle;
}

function idleBot(name: string) {
  return {
    name,
    version: "1.0.0",
    stats: defaultBotStats,
    goals: []
  };
}

function manualScript(length: number, intent: { throttle: -1 | 0 | 1; steer: -1 | 0 | 1; fire: boolean }) {
  return Array.from({ length }, () => intent);
}

describe("battle session engine", () => {
  it("produces deterministic tactical sequences when seeded the same way", () => {
    const run = () => {
      const session = createBattleSession({
        map: laneTacticalMap,
        seed: "seed-1",
        tanks: [
          createInitialTankState({
            id: "alpha",
            name: "Alpha",
            position: laneTacticalMap.spawnPoints[0],
            rotation: 0,
            isManual: false,
            bot: botDefinitionExample
          }),
          createInitialTankState({
            id: "beta",
            name: "Beta",
            position: laneTacticalMap.spawnPoints[1],
            rotation: Math.PI,
            isManual: false,
            bot: botDefinitionExample
          })
        ]
      });

      for (let tick = 0; tick < 48; tick += 1) {
        stepBattleSession(session);
      }

      return {
        tick: session.tick,
        replay: session.replay,
        tanks: session.tanks.map((tank) => ({
          position: { ...tank.position },
          rotation: tank.rotation,
          health: tank.health,
          tactic: tank.aiMemory.activeTacticId,
          opening: tank.aiMemory.openingChoice
        }))
      };
    };

    expect(run()).toEqual(run());
  });

  it("advances incrementally and records replay frames", () => {
    const session = createBattleSession({
      map: laneTacticalMap,
      seed: "incremental",
      tanks: [
        createInitialTankState({
          id: "alpha",
          name: "Alpha",
          position: laneTacticalMap.spawnPoints[0],
          rotation: 0,
          isManual: false,
          bot: botDefinitionExample
        }),
        createInitialTankState({
          id: "beta",
          name: "Beta",
          position: laneTacticalMap.spawnPoints[1],
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
      map: laneTacticalMap,
      seed: "idle-bot",
      tanks: [
        createInitialTankState({
          id: "alpha",
          name: "Alpha",
          position: laneTacticalMap.spawnPoints[0],
          rotation: 0,
          isManual: false,
          bot: {
            ...idleBot("Idle")
          }
        }),
        createInitialTankState({
          id: "beta",
          name: "Beta",
          position: laneTacticalMap.spawnPoints[1],
          rotation: Math.PI,
          isManual: false,
          bot: {
            ...idleBot("Idle 2")
          }
        })
      ]
    });

    for (let tick = 0; tick < 15; tick += 1) {
      stepBattleSession(session);
    }

    expect(session.tanks[0].position).toEqual(laneTacticalMap.spawnPoints[0]);
    expect(session.tanks[1].position).toEqual(laneTacticalMap.spawnPoints[1]);
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

  it("shows visible reverse-fire for Backstep Viper in the live default matchup without giving Ricochet Lynx the same behavior", () => {
    const session = createBattleSession({
      map: liveBattlefieldMap,
      seed: "debug-throttle7",
      tanks: [
        createInitialTankState({
          id: "alpha",
          name: botDefinitionExample.name,
          position: liveBattlefieldMap.spawnPoints[0],
          rotation: 0,
          isManual: false,
          bot: botDefinitionExample
        }),
        createInitialTankState({
          id: "beta",
          name: ricochetLynxBot.name,
          position: liveBattlefieldMap.spawnPoints[1],
          rotation: Math.PI,
          isManual: false,
          bot: ricochetLynxBot
        })
      ]
    });

    let backstepReverse: { goalId: string | null; bearingToEnemy: number } | null = null;
    let backstepReverseShot = false;
    let lynxReverseFire = false;

    for (let tick = 0; tick < 320; tick += 1) {
      stepBattleSession(session);

      const backstep = session.tanks[0];
      const lynx = session.tanks[1];
      const dx = lynx.position.x - backstep.position.x;
      const dy = lynx.position.y - backstep.position.y;
      const bearingToEnemy = normalizeAngle(Math.atan2(dy, dx) - backstep.rotation);

      if (lynx.intent.throttle === -1 && lynx.intent.fire) {
        lynxReverseFire = true;
      }

      if (
        (backstep.aiMemory.activeGoalId === "backpedal-burst" || backstep.aiMemory.activeGoalId === "retreat-fire")
        && backstep.intent.fire
      ) {
        backstepReverseShot = true;
      }

      if (
        !backstepReverse
        && backstep.aiMemory.lastEnemyVisible
        && backstep.intent.throttle === -1
        && (backstep.aiMemory.activeGoalId === "backpedal-burst" || backstep.aiMemory.activeGoalId === "retreat-fire")
        && Math.abs(bearingToEnemy) < Math.PI / 4
      ) {
        backstepReverse = {
          goalId: backstep.aiMemory.activeGoalId,
          bearingToEnemy
        };
      }
    }

    expect(backstepReverse).not.toBeNull();
    expect(backstepReverseShot).toBe(true);
    expect(backstepReverse?.goalId === "backpedal-burst" || backstepReverse?.goalId === "retreat-fire").toBe(true);
    expect(Math.abs(backstepReverse!.bearingToEnemy)).toBeLessThan(Math.PI / 4);
    expect(lynxReverseFire).toBe(false);
  });

  it("does not leave Backstep Viper pinned in a silent reverse-fire stare-down on the live battlefield", () => {
    const session = createBattleSession({
      map: liveBattlefieldMap,
      seed: "face-seed-2",
      tanks: [
        createInitialTankState({
          id: "alpha",
          name: botDefinitionExample.name,
          position: liveBattlefieldMap.spawnPoints[0],
          rotation: 0,
          isManual: false,
          bot: botDefinitionExample
        }),
        createInitialTankState({
          id: "beta",
          name: ricochetLynxBot.name,
          position: liveBattlefieldMap.spawnPoints[1],
          rotation: Math.PI,
          isManual: false,
          bot: ricochetLynxBot
        })
      ]
    });

    let pinnedSilentTicks = 0;
    let longestPinnedSilentRun = 0;
    let navigatedReverseNearWall = false;
    let previousBackstepPosition = { ...session.tanks[0].position };

    for (let tick = 0; tick < 640 && !session.completed; tick += 1) {
      stepBattleSession(session);

      const backstep = session.tanks[0];
      const movedDistance = distanceBetween(previousBackstepPosition, backstep.position);
      previousBackstepPosition = { ...backstep.position };
      const pinnedReverseGoal = backstep.aiMemory.activeGoalId === "backpedal-burst" || backstep.aiMemory.activeGoalId === "retreat-fire";
      if (
        pinnedReverseGoal
        && backstep.intent.throttle === -1
        && backstep.intent.steer !== 0
        && movedDistance > 0.01
        && wallClearance(backstep.position, liveBattlefieldMap) < 140
      ) {
        navigatedReverseNearWall = true;
      }
      const silentlyPinned = pinnedReverseGoal
        && backstep.aiMemory.lastEnemyVisible
        && backstep.intent.throttle === -1
        && !backstep.intent.fire
        && movedDistance < 0.01;

      if (silentlyPinned) {
        pinnedSilentTicks += 1;
        longestPinnedSilentRun = Math.max(longestPinnedSilentRun, pinnedSilentTicks);
      } else {
        pinnedSilentTicks = 0;
      }
    }

    expect(longestPinnedSilentRun).toBeLessThan(12);
    expect(navigatedReverseNearWall).toBe(true);
  });

  it("moves farther with a higher forward-speed stat line", () => {
    const runDistance = (stats: BotStats) => {
      const session = createBattleSession({
        map: openDuelMap,
        seed: `forward-${stats.forwardSpeed}`,
        tanks: [
          createInitialTankState({
            id: "alpha",
            name: "Alpha",
            position: openDuelMap.spawnPoints[0],
            rotation: 0,
            isManual: true,
            stats,
            manualScript: manualScript(10, { throttle: 1, steer: 0, fire: false })
          }),
          createInitialTankState({
            id: "beta",
            name: "Beta",
            position: openDuelMap.spawnPoints[1],
            rotation: Math.PI,
            isManual: true,
            manualScript: []
          })
        ]
      });

      for (let tick = 0; tick < 10; tick += 1) {
        stepBattleSession(session);
      }

      return session.tanks[0].position.x - openDuelMap.spawnPoints[0].x;
    };

    const fastDistance = runDistance({
      forwardSpeed: 100,
      reverseSpeed: 40,
      rotationSpeed: 60,
      fireRate: 50,
      bulletSpeed: 50
    });
    const slowDistance = runDistance({
      forwardSpeed: 20,
      reverseSpeed: 80,
      rotationSpeed: 60,
      fireRate: 70,
      bulletSpeed: 70
    });

    expect(fastDistance).toBeGreaterThan(slowDistance + 10);
  });

  it("fires again sooner with a higher fire-rate stat line", () => {
    const countBulletsAfterTicks = (stats: BotStats) => {
      const session = createBattleSession({
        map: openDuelMap,
        seed: `fire-${stats.fireRate}`,
        tanks: [
          createInitialTankState({
            id: "alpha",
            name: "Alpha",
            position: openDuelMap.spawnPoints[0],
            rotation: 0,
            isManual: true,
            stats,
            manualScript: manualScript(24, { throttle: 0, steer: 0, fire: true })
          }),
          createInitialTankState({
            id: "beta",
            name: "Beta",
            position: openDuelMap.spawnPoints[1],
            rotation: Math.PI,
            isManual: true,
            manualScript: []
          })
        ]
      });

      for (let tick = 0; tick < 24; tick += 1) {
        stepBattleSession(session);
      }

      return session.bullets.length;
    };

    const fasterFireBullets = countBulletsAfterTicks({
      forwardSpeed: 60,
      reverseSpeed: 60,
      rotationSpeed: 60,
      fireRate: 100,
      bulletSpeed: 20
    });
    const slowerFireBullets = countBulletsAfterTicks({
      forwardSpeed: 60,
      reverseSpeed: 60,
      rotationSpeed: 60,
      fireRate: 20,
      bulletSpeed: 100
    });

    expect(fasterFireBullets).toBeGreaterThan(slowerFireBullets);
  });

  it("pushes projectiles farther with a higher bullet-speed stat line", () => {
    const bulletXAfterTicks = (stats: BotStats) => {
      const session = createBattleSession({
        map: openDuelMap,
        seed: `bullet-${stats.bulletSpeed}`,
        tanks: [
          createInitialTankState({
            id: "alpha",
            name: "Alpha",
            position: openDuelMap.spawnPoints[0],
            rotation: 0,
            isManual: true,
            stats,
            manualScript: [{ throttle: 0, steer: 0, fire: true }]
          }),
          createInitialTankState({
            id: "beta",
            name: "Beta",
            position: openDuelMap.spawnPoints[1],
            rotation: Math.PI,
            isManual: true,
            manualScript: []
          })
        ]
      });

      for (let tick = 0; tick < 10; tick += 1) {
        stepBattleSession(session);
      }

      return session.bullets[0]?.position.x ?? 0;
    };

    const fasterBulletX = bulletXAfterTicks({
      forwardSpeed: 60,
      reverseSpeed: 60,
      rotationSpeed: 60,
      fireRate: 20,
      bulletSpeed: 100
    });
    const slowerBulletX = bulletXAfterTicks({
      forwardSpeed: 60,
      reverseSpeed: 60,
      rotationSpeed: 60,
      fireRate: 100,
      bulletSpeed: 20
    });

    expect(fasterBulletX).toBeGreaterThan(slowerBulletX + 20);
  });

  it("roams around a blocked map instead of stalling at spawn", () => {
    const session = createBattleSession({
      map: laneTacticalMap,
      seed: "search-and-engage",
      tanks: [
        createInitialTankState({
          id: "alpha",
          name: "Alpha",
          position: laneTacticalMap.spawnPoints[0],
          rotation: 0,
          isManual: false,
          bot: botDefinitionExample
        }),
        createInitialTankState({
          id: "beta",
          name: "Beta",
          position: laneTacticalMap.spawnPoints[1],
          rotation: Math.PI,
          isManual: false,
          bot: botDefinitionExample
        })
      ]
    });

    for (let tick = 0; tick < 120; tick += 1) {
      stepBattleSession(session);
    }

    expect(distanceBetween(session.tanks[0].position, laneTacticalMap.spawnPoints[0])).toBeGreaterThan(40);
    expect(distanceBetween(session.tanks[1].position, laneTacticalMap.spawnPoints[1])).toBeGreaterThan(40);
    expect(session.tanks[0].aiMemory.activeTacticId).not.toBeNull();
    expect(session.tanks[1].aiMemory.activeTacticId).not.toBeNull();
  });

  it("produces different early tactical openings for different seeds", () => {
    const runOpening = (seed: string) => {
      const session = createBattleSession({
        map: laneTacticalMap,
        seed,
        tanks: [
          createInitialTankState({
            id: "alpha",
            name: "Alpha",
            position: laneTacticalMap.spawnPoints[0],
            rotation: 0,
            isManual: false,
            bot: botDefinitionExample
          }),
          createInitialTankState({
            id: "beta",
            name: "Beta",
            position: laneTacticalMap.spawnPoints[1],
            rotation: Math.PI,
            isManual: false,
            bot: botDefinitionExample
          })
        ]
      });

      for (let tick = 0; tick < 18; tick += 1) {
        stepBattleSession(session);
      }

      return {
        position: { ...session.tanks[0].position },
        tactic: session.tanks[0].aiMemory.activeTacticId,
        opening: session.tanks[0].aiMemory.openingChoice
      };
    };

    const left = runOpening("opening-a");
    const right = runOpening("opening-b");

    expect(left.opening).not.toBeNull();
    expect(right.opening).not.toBeNull();
    expect(left.opening).not.toBe(right.opening);
    expect(left.tactic).not.toBeNull();
    expect(right.tactic).not.toBeNull();
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

  it("records a tank hit effect and removes a life when a bullet lands", () => {
    const session = createBattleSession({
      map: openDuelMap,
      seed: "tank-hit",
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
          manualScript: []
        })
      ]
    });

    let hitEffectSeen = false;

    for (let tick = 0; tick < 90; tick += 1) {
      const snapshot = stepBattleSession(session);
      const hitEffect = snapshot.effects.find((effect) => effect.kind === "tankHit");
      if (hitEffect) {
        hitEffectSeen = true;
        expect(hitEffect.tankId).toBe("beta");
        expect(hitEffect.remainingHealth).toBe(2);
        expect(session.tanks[1].health).toBe(2);
        break;
      }
    }

    expect(hitEffectSeen).toBe(true);
  });

  it("ends a stalled duel at the configured time limit", () => {
    const session = createBattleSession({
      map: laneTacticalMap,
      seed: "timeout-check",
      tanks: [
        createInitialTankState({
          id: "alpha",
          name: "Alpha",
          position: laneTacticalMap.spawnPoints[0],
          rotation: 0,
          isManual: false,
          bot: {
            ...idleBot("Idle")
          }
        }),
        createInitialTankState({
          id: "beta",
          name: "Beta",
          position: laneTacticalMap.spawnPoints[1],
          rotation: Math.PI,
          isManual: false,
          bot: {
            ...idleBot("Idle 2")
          }
        })
      ]
    });

    session.maxTicks = 6;

    while (!session.completed) {
      stepBattleSession(session);
    }

    expect(session.tick).toBe(6);
    expect(session.reason).toBe("draw");
    expect(session.result?.reason).toBe("draw");
  });
});
