import { chooseIntent } from "../game/botInterpreter.js";
import { botDefinitionExample, defaultBotStats, validateBotDefinition } from "./bot.js";

const baseSensors = {
  enemyVisible: true,
  enemyBearing: 0,
  enemyAlignment: 1,
  enemyDistance: 0.5,
  enemyDistanceBand: "medium" as const,
  wallProximity: 0.2,
  wallDistanceBand: "far" as const,
  bulletThreat: false,
  bulletThreatLevel: 0,
  interceptBearing: 0,
  searchBearing: 0,
  hasRecentEnemyContact: false,
  stalled: false,
  ticksSinceEnemySeen: 0,
  searchTurnDirection: 1 as const,
  coverScore: 0.2,
  exposureScore: 0.6,
  routeSafety: 0.4,
  flankOpportunity: 0.2,
  bankShotOpportunity: 0,
  roamBearing: 0.1,
  investigateBearing: 0.1,
  coverBearing: -0.4,
  peekBearing: 0.08,
  flankLeftBearing: -0.7,
  flankRightBearing: 0.7,
  retreatBearing: -1.2,
  baitBearing: 0.2,
  bankShotBearing: 0.4,
  cooldownReady: true,
  stuckTimer: 0,
  healthRatio: 1,
  healthBand: "far" as const
};

const baseMemory = {
  activeGoalId: null,
  activeGoalTicks: 0,
  activeTacticId: null,
  activeTacticTicks: 0,
  lastCompletedTacticId: null,
  stalledTicks: 0,
  previousEnemyDistance: null,
  lastSeenEnemyPosition: null,
  lastSeenEnemyVelocity: { x: 0, y: 0 },
  ticksSinceEnemySeen: 0,
  searchTurnDirection: 1 as const,
  preferredFlankDirection: 1 as const,
  openingChoice: null,
  openingTicksRemaining: 0,
  roamTarget: null,
  ticksSinceLastHit: 999,
  lastEnemyVisible: false,
  reverseBurstTicksRemaining: 0,
  reverseHoldTicksRemaining: 0,
  tacticCooldowns: {
    roam: 0,
    investigateLastSeen: 0,
    takeCover: 0,
    peekShot: 0,
    flank: 0,
    pressure: 0,
    retreat: 0,
    baitShot: 0
  }
};

describe("bot schema", () => {
  it("accepts the bundled example", () => {
    expect(validateBotDefinition(botDefinitionExample)).toEqual(botDefinitionExample);
  });

  it("rejects a bot definition without stats", () => {
    expect(() => validateBotDefinition({
      name: "Missing Stats",
      version: "1.0.0",
      goals: []
    })).toThrow(/stats/i);
  });

  it("rejects stat totals that do not equal the 300-point budget", () => {
    expect(() => validateBotDefinition({
      ...botDefinitionExample,
      stats: {
        ...defaultBotStats,
        forwardSpeed: 61
      }
    })).toThrow(/300/i);
  });

  it("rejects non-integer and out-of-range stat values", () => {
    expect(() => validateBotDefinition({
      ...botDefinitionExample,
      stats: {
        ...defaultBotStats,
        forwardSpeed: 60.5,
        bulletSpeed: 101
      }
    })).toThrow();
  });

  it("rejects unknown fields", () => {
    expect(() => validateBotDefinition({
      ...botDefinitionExample,
      hack: true
    })).toThrow();
  });

  it("accepts reverse-burst authoring on attack and lineUpShot goals", () => {
    expect(() => validateBotDefinition({
      ...botDefinitionExample,
      goals: [
        {
          ...botDefinitionExample.goals[2],
          movementProfile: {
            ...botDefinitionExample.goals[2].movementProfile,
            engagementDrive: "reverseBurst",
            reverseBurstTicks: 8,
            reverseHoldTicks: 3
          }
        },
        {
          ...botDefinitionExample.goals[3],
          movementProfile: {
            ...botDefinitionExample.goals[3].movementProfile,
            engagementDrive: "reverseBurst",
            reverseBurstTicks: 10,
            reverseHoldTicks: 2
          }
        }
      ]
    })).not.toThrow();
  });

  it("rejects reverse-burst on unsupported goal types and invalid burst ranges", () => {
    expect(() => validateBotDefinition({
      ...botDefinitionExample,
      goals: [
        {
          ...botDefinitionExample.goals[0],
          movementProfile: {
            ...botDefinitionExample.goals[0].movementProfile,
            engagementDrive: "reverseBurst"
          }
        }
      ]
    })).toThrow(/Reverse-burst/i);

    expect(() => validateBotDefinition({
      ...botDefinitionExample,
      goals: [
        {
          ...botDefinitionExample.goals[2],
          movementProfile: {
            ...botDefinitionExample.goals[2].movementProfile,
            engagementDrive: "reverseBurst",
            reverseBurstTicks: 0,
            reverseHoldTicks: 31
          }
        }
      ]
    })).toThrow();
  });

  it("returns an idle intent for a behaviorless bot", () => {
    const choice = chooseIntent({
      name: "Idle",
      version: "1.0.0",
      stats: defaultBotStats,
      goals: []
    }, baseSensors, baseMemory, () => 0.5);

    expect(choice).toEqual({
      goalId: null,
      intent: {
        throttle: 0,
        steer: 0,
        fire: false
      }
    });
  });
});
