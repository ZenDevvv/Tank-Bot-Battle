import type { BotAction, BotCondition, BotDefinition } from "../schema/bot.js";
import type { BotSensors, TankCommand } from "./types.js";

function compareCondition(condition: BotCondition, sensors: BotSensors): boolean {
  const sensorValue = sensors[condition.type];
  const expected = condition.value;
  const operator = condition.operator ?? "equals";

  if (operator === "equals") {
    return sensorValue === expected;
  }

  if (typeof sensorValue !== "number" || typeof expected !== "number") {
    return false;
  }

  if (operator === "gte") {
    return sensorValue >= expected;
  }

  return sensorValue <= expected;
}

function actionToCommand(action: BotAction): TankCommand {
  return action.type;
}

export function chooseCommands(bot: BotDefinition, sensors: BotSensors): TankCommand[] {
  const selectedRule = [...bot.rules]
    .sort((left, right) => right.priority - left.priority)
    .find((rule) => rule.when.every((condition) => compareCondition(condition, sensors)));

  if (!selectedRule) {
    return ["stop"];
  }

  return selectedRule.then.map(actionToCommand);
}
