import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";

export const sensorOperators = [
  "equals",
  "gte",
  "lte"
] as const;

export const conditionTypes = [
  "enemyVisible",
  "enemyBearing",
  "enemyDistanceBand",
  "wallDistanceBand",
  "bulletThreat",
  "cooldownReady",
  "stuckTimer",
  "healthBand"
] as const;

export const actionTypes = [
  "moveForward",
  "moveBackward",
  "turnLeft",
  "turnRight",
  "fire",
  "stop"
] as const;

export const bandValues = ["near", "medium", "far"] as const;

export const botConditionSchema = z.object({
  type: z.enum(conditionTypes),
  operator: z.enum(sensorOperators).optional(),
  value: z.union([
    z.boolean(),
    z.number(),
    z.enum(bandValues)
  ]).optional()
}).strict();

export const botActionSchema = z.object({
  type: z.enum(actionTypes),
  durationTicks: z.number().int().min(1).max(60).optional()
}).strict();

export const botRuleSchema = z.object({
  id: z.string().min(1).max(64),
  priority: z.number().int().min(0).max(1000),
  when: z.array(botConditionSchema).min(1).max(8),
  then: z.array(botActionSchema).min(1).max(3)
}).strict();

export const botDefinitionSchema = z.object({
  name: z.string().min(2).max(40),
  version: z.string().min(1).max(16),
  author: z.string().min(1).max(40).optional(),
  rules: z.array(botRuleSchema).min(1).max(32)
}).strict();

export type BotDefinition = z.infer<typeof botDefinitionSchema>;
export type BotRule = z.infer<typeof botRuleSchema>;
export type BotCondition = z.infer<typeof botConditionSchema>;
export type BotAction = z.infer<typeof botActionSchema>;

export const botDefinitionJsonSchema = zodToJsonSchema(botDefinitionSchema, {
  name: "BotDefinition"
});

export const botDefinitionExample: BotDefinition = {
  name: "Corner Hunter",
  version: "1.0.0",
  author: "System",
  rules: [
    {
      id: "evade-bullet",
      priority: 100,
      when: [
        { type: "bulletThreat", operator: "equals", value: true }
      ],
      then: [
        { type: "turnRight", durationTicks: 15 },
        { type: "moveForward", durationTicks: 15 }
      ]
    },
    {
      id: "shoot-visible-enemy",
      priority: 90,
      when: [
        { type: "enemyVisible", operator: "equals", value: true },
        { type: "cooldownReady", operator: "equals", value: true }
      ],
      then: [
        { type: "fire" }
      ]
    },
    {
      id: "approach-enemy",
      priority: 60,
      when: [
        { type: "enemyDistanceBand", operator: "equals", value: "far" }
      ],
      then: [
        { type: "moveForward", durationTicks: 20 }
      ]
    },
    {
      id: "default-patrol",
      priority: 10,
      when: [
        { type: "wallDistanceBand", operator: "equals", value: "near" }
      ],
      then: [
        { type: "turnLeft", durationTicks: 18 },
        { type: "moveForward", durationTicks: 15 }
      ]
    }
  ]
};

export function validateBotDefinition(input: unknown): BotDefinition {
  return botDefinitionSchema.parse(input);
}
