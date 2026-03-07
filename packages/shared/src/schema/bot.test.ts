import { chooseCommands } from "../game/botInterpreter.js";
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

  it("chooses the highest-priority matching rule", () => {
    const commands = chooseCommands(botDefinitionExample, {
      enemyVisible: true,
      enemyBearing: 0,
      enemyDistanceBand: "medium",
      wallDistanceBand: "far",
      bulletThreat: false,
      cooldownReady: true,
      stuckTimer: 0,
      healthBand: "far"
    });

    expect(commands).toEqual(["fire"]);
  });
});
