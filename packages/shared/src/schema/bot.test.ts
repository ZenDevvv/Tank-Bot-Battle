import { chooseIntent } from "../game/botInterpreter.js";
import { botDefinitionExample, validateBotDefinition } from "./bot.js";

describe("bot schema", () => {
  it("accepts the bundled example", () => {
    expect(validateBotDefinition(botDefinitionExample)).toEqual(botDefinitionExample);
  });

  it("rejects unknown fields", () => {
    expect(() => validateBotDefinition({
      ...botDefinitionExample,
      hack: true
    })).toThrow();
  });

  it("returns an idle intent for a behaviorless bot", () => {
    const choice = chooseIntent({
      name: "Idle",
      version: "1.0.0",
      goals: []
    }, {
      enemyVisible: true,
      enemyBearing: 0,
      enemyAlignment: 1,
      enemyDistance: 0.5,
      enemyDistanceBand: "medium",
      wallProximity: 0.2,
      wallDistanceBand: "far",
      bulletThreat: false,
      bulletThreatLevel: 0,
      interceptBearing: 0,
      searchBearing: 0,
      hasRecentEnemyContact: false,
      stalled: false,
      ticksSinceEnemySeen: 0,
      searchTurnDirection: 1,
      cooldownReady: true,
      stuckTimer: 0,
      healthRatio: 1,
      healthBand: "far"
    }, {
      activeGoalId: null,
      activeGoalTicks: 0,
      stalledTicks: 0,
      previousEnemyDistance: null,
      lastSeenEnemyPosition: null,
      lastSeenEnemyVelocity: { x: 0, y: 0 },
      ticksSinceEnemySeen: 0,
      searchTurnDirection: 1
    }, () => 0.5);

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
