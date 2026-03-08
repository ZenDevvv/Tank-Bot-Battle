import { chooseIntent } from "./botInterpreter.js";
import type { BotDefinition } from "../schema/bot.js";
import type { BotSensors, TankAiMemory } from "./types.js";

function createSensors(overrides: Partial<BotSensors> = {}): BotSensors {
  return {
    enemyVisible: false,
    enemyBearing: 0,
    enemyAlignment: 0.35,
    enemyDistance: 0.45,
    enemyDistanceBand: "medium",
    wallProximity: 0.25,
    wallDistanceBand: "medium",
    bulletThreat: false,
    bulletThreatLevel: 0,
    interceptBearing: 0,
    reverseEscapeBearing: 0,
    reverseEscapeSafety: 1,
    searchBearing: 0.2,
    hasRecentEnemyContact: true,
    stalled: false,
    ticksSinceEnemySeen: 22,
    searchTurnDirection: 1,
    coverScore: 0.45,
    exposureScore: 0.3,
    routeSafety: 0.7,
    flankOpportunity: 0.85,
    bankShotOpportunity: 0.25,
    roamBearing: 0.35,
    investigateBearing: 0.12,
    coverBearing: -0.5,
    peekBearing: 0.08,
    flankLeftBearing: -0.85,
    flankRightBearing: 0.85,
    retreatBearing: -1.1,
    baitBearing: 0.22,
    bankShotBearing: 0.55,
    cooldownReady: true,
    stuckTimer: 0,
    healthRatio: 0.9,
    healthBand: "far",
    ...overrides
  };
}

function createMemory(overrides: Partial<TankAiMemory> = {}): TankAiMemory {
  return {
    activeGoalId: null,
    activeGoalTicks: 0,
    activeTacticId: null,
    activeTacticTicks: 0,
    lastCompletedTacticId: null,
    stalledTicks: 0,
    previousEnemyDistance: null,
    lastSeenEnemyPosition: null,
    lastSeenEnemyVelocity: { x: 0, y: 0 },
    ticksSinceEnemySeen: 22,
    searchTurnDirection: 1,
    preferredFlankDirection: 1,
    openingChoice: null,
    openingTicksRemaining: 0,
    roamTarget: null,
    ticksSinceLastHit: 999,
    lastEnemyVisible: false,
    reverseBurstTicksRemaining: 0,
    reverseHoldTicksRemaining: 0,
    reverseEscapeUnsafeTicks: 0,
    tacticCooldowns: {
      roam: 0,
      investigateLastSeen: 0,
      takeCover: 0,
      peekShot: 0,
      flank: 0,
      pressure: 0,
      retreat: 0,
      baitShot: 0
    },
    ...overrides
  };
}

const tacticalBot: BotDefinition = {
  name: "Planner Bot",
  version: "1.0.0",
  stats: {
    forwardSpeed: 62,
    reverseSpeed: 46,
    rotationSpeed: 68,
    fireRate: 54,
    bulletSpeed: 70
  },
  openings: [
    { kind: "wideFlankLeft", weight: 3 },
    { kind: "holdAngle", weight: 1 }
  ],
  tactics: {
    roam: { weight: 1 },
    takeCover: { weight: 1.2, thresholds: { enemyVisible: true } },
    flank: { weight: 1.8, preferredSide: "left", thresholds: { minFlankOpportunity: 0.4 } },
    pressure: { weight: 0.6, thresholds: { enemyVisible: true } }
  },
  commitment: {
    minPlanTicks: 16,
    maxPlanTicks: 48,
    cooldownTicks: 12,
    replanOnSightChange: true,
    replanOnHit: true,
    replanOnStuck: true
  },
  variance: {
    planJitter: 0,
    rerollChance: 0,
    openingMix: 1
  },
  goals: [
    {
      id: "seek-route",
      type: "reposition",
      priority: 82,
      weightProfile: {
        enemyVisible: -1,
        enemyDistance: -0.5
      },
      movementProfile: {
        preferredRange: "medium",
        throttleBias: 1,
        turnBias: 0.2,
        orbitBias: 0,
        dodgeBias: 0.1,
        engagementDrive: "default",
        reverseBurstTicks: 12,
        reverseHoldTicks: 4
      }
    },
    {
      id: "press-angle",
      type: "attack",
      priority: 84,
      weightProfile: {
        enemyVisible: 1.8,
        enemyAlignment: 1.4
      },
      movementProfile: {
        preferredRange: "near",
        throttleBias: 1,
        turnBias: 0.1,
        orbitBias: 0,
        dodgeBias: 0.05,
        engagementDrive: "default",
        reverseBurstTicks: 12,
        reverseHoldTicks: 4
      },
      firePolicy: {
        requiresEnemyVisible: true,
        maxBearingOffset: Math.PI / 8,
        minUtilityToFire: 80,
        fireChance: 1
      }
    }
  ]
};

describe("bot interpreter tactical planner", () => {
  it("commits to a selected tactic before the minimum duration elapses", () => {
    const memory = createMemory({
      activeTacticId: "flank",
      activeTacticTicks: 5,
      openingChoice: "wideFlankLeft",
      openingTicksRemaining: 10
    });

    chooseIntent(
      tacticalBot,
      createSensors({ enemyVisible: true, flankOpportunity: 0.1, exposureScore: 0.8 }),
      memory,
      () => 0.2
    );

    expect(memory.activeTacticId).toBe("flank");
  });

  it("selects the same opening and tactic for the same rng stream", () => {
    const createDeterministicRng = () => {
      const values = [0.12, 0.24, 0.36];
      let index = 0;
      return () => {
        const value = values[index] ?? values[values.length - 1];
        index += 1;
        return value;
      };
    };

    const leftMemory = createMemory();
    const rightMemory = createMemory();
    const leftChoice = chooseIntent(tacticalBot, createSensors(), leftMemory, createDeterministicRng());
    const rightChoice = chooseIntent(tacticalBot, createSensors(), rightMemory, createDeterministicRng());

    expect(leftMemory.openingChoice).toBe(rightMemory.openingChoice);
    expect(leftMemory.activeTacticId).toBe(rightMemory.activeTacticId);
    expect(leftChoice.intent).toEqual(rightChoice.intent);
  });

  it("picks different authored openings when the rng stream changes", () => {
    const leftMemory = createMemory();
    const rightMemory = createMemory();

    chooseIntent(tacticalBot, createSensors(), leftMemory, () => 0.05);
    chooseIntent(tacticalBot, createSensors(), rightMemory, () => 0.95);

    expect(leftMemory.openingChoice).not.toBe(rightMemory.openingChoice);
  });
});

describe("bot interpreter reverse burst", () => {
  const reverseBurstBot: BotDefinition = {
    name: "Reverse Burst",
    version: "1.0.0",
    stats: {
      forwardSpeed: 50,
      reverseSpeed: 90,
      rotationSpeed: 60,
      fireRate: 55,
      bulletSpeed: 45
    },
    tactics: {
      retreat: {
        weight: 2.5,
        thresholds: {
          enemyVisible: true
        }
      }
    },
    goals: [
      {
        id: "backpedal-shot",
        type: "lineUpShot",
        priority: 92,
        weightProfile: {
          enemyVisible: 1.5,
          enemyAlignment: 2.5,
          cooldownReady: 1
        },
        movementProfile: {
          preferredRange: "far",
          throttleBias: -0.7,
          turnBias: 0.2,
          orbitBias: 0.2,
          dodgeBias: 0.1,
          engagementDrive: "reverseBurst",
          reverseBurstTicks: 2,
          reverseHoldTicks: 1
        },
        firePolicy: {
          requiresEnemyVisible: true,
          maxBearingOffset: Math.PI / 12,
          minUtilityToFire: 80,
          fireChance: 1
        }
      }
    ]
  };

  it("starts reversing while aligned on a visible target", () => {
    const memory = createMemory();
    const choice = chooseIntent(
      reverseBurstBot,
      createSensors({
        enemyVisible: true,
        interceptBearing: 0.05,
        enemyBearing: 0.05,
        enemyAlignment: 0.95,
        wallProximity: 0.2
      }),
      memory,
      () => 0.2
    );

    expect(choice.intent.throttle).toBe(-1);
    expect(choice.intent.fire).toBe(true);
    expect(memory.reverseBurstTicksRemaining).toBe(1);
    expect(memory.reverseHoldTicksRemaining).toBe(0);
  });

  it("keeps aiming at the enemy instead of retreat-bearing during reverse burst", () => {
    const memory = createMemory();
    const choice = chooseIntent(
      reverseBurstBot,
      createSensors({
        enemyVisible: true,
        interceptBearing: 0.04,
        enemyBearing: 0.04,
        retreatBearing: -1.1,
        enemyAlignment: 0.96,
        wallProximity: 0.2
      }),
      memory,
      () => 0.2
    );

    expect(memory.activeTacticId).toBe("retreat");
    expect(choice.intent.throttle).toBe(-1);
    expect(choice.intent.steer).toBe(1);
  });

  it("pins the active reverse-burst goal through the burst cycle instead of rescoring away from it", () => {
    const memory = createMemory({
      activeGoalId: "backpedal-shot",
      activeTacticId: "retreat",
      reverseBurstTicksRemaining: 2
    });
    const competitiveBot: BotDefinition = {
      ...reverseBurstBot,
      goals: [
        ...reverseBurstBot.goals,
        {
          id: "panic-run",
          type: "evade",
          priority: 140,
          weightProfile: {
            enemyVisible: 2,
            bulletThreat: 1.5
          },
          movementProfile: {
            preferredRange: "far",
            throttleBias: 1,
            turnBias: 0.6,
            orbitBias: 0.8,
            dodgeBias: 0.9,
            engagementDrive: "default",
            reverseBurstTicks: 12,
            reverseHoldTicks: 4
          },
          firePolicy: {
            requiresEnemyVisible: true,
            maxBearingOffset: Math.PI / 6,
            minUtilityToFire: 999,
            fireChance: 0
          }
        }
      ]
    };

    const choice = chooseIntent(
      competitiveBot,
      createSensors({
        enemyVisible: true,
        interceptBearing: 0.05,
        enemyBearing: 0.05,
        enemyAlignment: 0.94,
        bulletThreat: true,
        bulletThreatLevel: 0.7,
        wallProximity: 0.2
      }),
      memory,
      () => 0.2
    );

    expect(choice.goalId).toBe("backpedal-shot");
    expect(choice.intent.throttle).toBe(-1);
    expect(memory.reverseBurstTicksRemaining).toBe(1);
  });

  it("falls back to a hold window after the reverse burst completes", () => {
    const memory = createMemory({
      activeGoalId: "backpedal-shot",
      reverseBurstTicksRemaining: 1,
      reverseHoldTicksRemaining: 0
    });

    const second = chooseIntent(
      reverseBurstBot,
      createSensors({
        enemyVisible: true,
        interceptBearing: 0.04,
        enemyBearing: 0.04,
        enemyAlignment: 0.96
      }),
      memory,
      () => 0.2
    );

    expect(second.intent.throttle).toBe(-1);
    expect(memory.reverseBurstTicksRemaining).toBe(0);
    expect(memory.reverseHoldTicksRemaining).toBe(1);

    const third = chooseIntent(
      reverseBurstBot,
      createSensors({
        enemyVisible: true,
        interceptBearing: 0.03,
        enemyBearing: 0.03,
        enemyAlignment: 0.97
      }),
      memory,
      () => 0.2
    );

    expect(third.intent.throttle).toBe(0);
    expect(third.intent.fire).toBe(true);
    expect(memory.reverseHoldTicksRemaining).toBe(0);
  });

  it("can start reverse burst before the shot is fully lined up but still holds fire outside the firing window", () => {
    const memory = createMemory();
    const choice = chooseIntent(
      reverseBurstBot,
      createSensors({
        enemyVisible: true,
        interceptBearing: 0.4,
        enemyBearing: 0.4,
        enemyAlignment: 0.7
      }),
      memory,
      () => 0.2
    );

    expect(choice.intent.throttle).toBe(-1);
    expect(choice.intent.fire).toBe(false);
    expect(memory.reverseBurstTicksRemaining).toBe(1);
    expect(memory.reverseHoldTicksRemaining).toBe(0);
  });

  it("navigates backward around walls instead of reversing straight into them", () => {
    const memory = createMemory();
    const choice = chooseIntent(
      reverseBurstBot,
      createSensors({
        enemyVisible: true,
        interceptBearing: 0.02,
        enemyBearing: 0.02,
        enemyAlignment: 0.98,
        reverseEscapeBearing: -1,
        reverseEscapeSafety: 0.25,
        wallProximity: 0.82
      }),
      memory,
      () => 0.2
    );

    expect(choice.intent.throttle).toBe(-1);
    expect(choice.intent.steer).toBe(-1);
    expect(choice.intent.fire).toBe(false);
  });

  it("does not cancel reverse burst immediately on the first unsafe reverse tick", () => {
    const memory = createMemory({
      activeGoalId: "backpedal-shot",
      reverseBurstTicksRemaining: 1
    });

    const choice = chooseIntent(
      reverseBurstBot,
      createSensors({
        enemyVisible: true,
        interceptBearing: 0.03,
        enemyBearing: 0.03,
        enemyAlignment: 0.97,
        reverseEscapeBearing: -0.7,
        reverseEscapeSafety: 0.1,
        wallProximity: 0.88
      }),
      memory,
      () => 0.2
    );

    expect(choice.intent.throttle).toBe(-1);
    expect(memory.reverseEscapeUnsafeTicks).toBe(1);
  });

  it("cancels reverse burst when enemy contact is lost", () => {
    const memory = createMemory({
      activeGoalId: "backpedal-shot",
      reverseBurstTicksRemaining: 1
    });

    const choice = chooseIntent(
      reverseBurstBot,
      createSensors({
        enemyVisible: false,
        interceptBearing: 0.02,
        enemyBearing: 0.02,
        enemyAlignment: 0.98
      }),
      memory,
      () => 0.2
    );

    expect(choice.intent.throttle).not.toBe(-1);
    expect(memory.reverseBurstTicksRemaining).toBe(0);
    expect(memory.reverseHoldTicksRemaining).toBe(0);
  });

  it("cancels reverse burst when the tank is pinned near a wall", () => {
    const memory = createMemory({
      activeGoalId: "backpedal-shot",
      reverseBurstTicksRemaining: 1,
      reverseEscapeUnsafeTicks: 2
    });

    const choice = chooseIntent(
      reverseBurstBot,
      createSensors({
        enemyVisible: true,
        interceptBearing: 0.02,
        enemyBearing: 0.02,
        enemyAlignment: 0.98,
        reverseEscapeBearing: -1.1,
        reverseEscapeSafety: 0.1,
        wallProximity: 0.88,
        stuckTimer: 0
      }),
      memory,
      () => 0.2
    );

    expect(choice.intent.throttle).not.toBe(-1);
    expect(memory.reverseBurstTicksRemaining).toBe(0);
    expect(memory.reverseHoldTicksRemaining).toBe(0);
  });
});

describe("bot interpreter unstick handling", () => {
  it("does not let the active tactic override an unstick goal", () => {
    const unstickBot: BotDefinition = {
      name: "Unstick Bot",
      version: "1.0.0",
      stats: {
        forwardSpeed: 60,
        reverseSpeed: 60,
        rotationSpeed: 60,
        fireRate: 60,
        bulletSpeed: 60
      },
      tactics: {
        pressure: {
          weight: 2,
          thresholds: {
            enemyVisible: true
          }
        }
      },
      goals: [
        {
          id: "escape-wall-trap",
          type: "unstick",
          priority: 95,
          weightProfile: {
            stuckTimer: 2,
            wallProximity: 1.5
          },
          thresholds: {
            stuckTimerGte: 8
          },
          movementProfile: {
            preferredRange: "far",
            throttleBias: -1,
            turnBias: 1,
            orbitBias: 1,
            dodgeBias: 0,
            engagementDrive: "default",
            reverseBurstTicks: 12,
            reverseHoldTicks: 4
          },
          firePolicy: {
            requiresEnemyVisible: false,
            maxBearingOffset: Math.PI / 4,
            minUtilityToFire: 999,
            fireChance: 0
          }
        }
      ]
    };

    const memory = createMemory({
      activeTacticId: "pressure",
      activeTacticTicks: 12
    });

    const choice = chooseIntent(
      unstickBot,
      createSensors({
        enemyVisible: true,
        stuckTimer: 10,
        wallProximity: 0.9
      }),
      memory,
      () => 0.2
    );

    expect(choice.goalId).toBe("escape-wall-trap");
    expect(choice.intent.throttle).toBe(-1);
    expect(choice.intent.steer).toBe(1);
  });

  it("breaks a close-range pressure stare-down instead of holding still forever", () => {
    const pressureBot: BotDefinition = {
      name: "Pressure Bot",
      version: "1.0.0",
      stats: {
        forwardSpeed: 60,
        reverseSpeed: 60,
        rotationSpeed: 60,
        fireRate: 60,
        bulletSpeed: 60
      },
      tactics: {
        pressure: {
          weight: 2,
          thresholds: {
            enemyVisible: true
          }
        }
      },
      goals: [
        {
          id: "close-pressure",
          type: "attack",
          priority: 90,
          weightProfile: {
            enemyVisible: 1.4,
            enemyAlignment: 1.7,
            enemyDistance: 1.2,
            cooldownReady: 1
          },
          thresholds: {
            enemyVisible: true
          },
          movementProfile: {
            preferredRange: "near",
            throttleBias: 1,
            turnBias: 0.2,
            orbitBias: -0.15,
            dodgeBias: 0.05,
            engagementDrive: "default",
            reverseBurstTicks: 12,
            reverseHoldTicks: 4
          },
          firePolicy: {
            requiresEnemyVisible: true,
            maxBearingOffset: Math.PI / 8,
            minUtilityToFire: 82,
            fireChance: 0.94
          }
        }
      ]
    };

    const choice = chooseIntent(
      pressureBot,
      createSensors({
        enemyVisible: true,
        enemyDistanceBand: "near",
        enemyAlignment: 0.82,
        cooldownReady: true,
        stuckTimer: 9
      }),
      createMemory({
        activeTacticId: "pressure",
        activeTacticTicks: 18
      }),
      () => 0.2
    );

    expect(choice.goalId).toBe("close-pressure");
    expect(choice.intent.throttle).toBe(-1);
  });
});
