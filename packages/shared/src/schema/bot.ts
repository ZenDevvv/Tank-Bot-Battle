import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";

export const goalTypes = [
  "attack",
  "evade",
  "reposition",
  "unstick",
  "lineUpShot"
] as const;

export const bandValues = ["near", "medium", "far"] as const;

export const utilityWeightProfileSchema = z.object({
  enemyVisible: z.number().min(-3).max(3).optional(),
  enemyAlignment: z.number().min(-3).max(3).optional(),
  enemyDistance: z.number().min(-3).max(3).optional(),
  wallProximity: z.number().min(-3).max(3).optional(),
  bulletThreat: z.number().min(-3).max(3).optional(),
  cooldownReady: z.number().min(-3).max(3).optional(),
  stuckTimer: z.number().min(-3).max(3).optional(),
  healthRatio: z.number().min(-3).max(3).optional()
}).strict();

export const goalThresholdSchema = z.object({
  enemyVisible: z.boolean().optional(),
  bulletThreat: z.boolean().optional(),
  cooldownReady: z.boolean().optional(),
  enemyDistanceBand: z.enum(bandValues).optional(),
  wallDistanceBand: z.enum(bandValues).optional(),
  healthBand: z.enum(bandValues).optional(),
  enemyBearingAbsLte: z.number().min(0).max(Math.PI).optional(),
  stuckTimerGte: z.number().int().min(0).max(240).optional()
}).strict();

export const movementProfileSchema = z.object({
  preferredRange: z.enum(bandValues).default("medium"),
  throttleBias: z.number().min(-1).max(1).default(0),
  turnBias: z.number().min(-1).max(1).default(0),
  orbitBias: z.number().min(-1).max(1).default(0),
  dodgeBias: z.number().min(0).max(1).default(0)
}).strict();

export const firePolicySchema = z.object({
  requiresEnemyVisible: z.boolean().default(true),
  maxBearingOffset: z.number().min(0).max(Math.PI).default(Math.PI / 10),
  minUtilityToFire: z.number().min(-100).max(100).default(0),
  fireChance: z.number().min(0).max(1).default(1)
}).strict();

export const goalNoiseSchema = z.object({
  scoreJitter: z.number().min(0).max(2).default(0)
}).strict();

export const utilityGoalSchema = z.object({
  id: z.string().min(1).max(64),
  type: z.enum(goalTypes),
  priority: z.number().int().min(0).max(1000),
  weightProfile: utilityWeightProfileSchema.default({}),
  thresholds: goalThresholdSchema.optional(),
  movementProfile: movementProfileSchema,
  firePolicy: firePolicySchema.optional(),
  noise: goalNoiseSchema.optional()
}).strict();

export const botDefinitionSchema = z.object({
  name: z.string().min(2).max(40),
  version: z.string().min(1).max(16),
  author: z.string().min(1).max(40).optional(),
  goals: z.array(utilityGoalSchema).max(32).default([])
}).strict();

export type BotDefinition = z.infer<typeof botDefinitionSchema>;
export type UtilityGoal = z.infer<typeof utilityGoalSchema>;
export type UtilityWeightProfile = z.infer<typeof utilityWeightProfileSchema>;
export type GoalThresholds = z.infer<typeof goalThresholdSchema>;
export type MovementProfile = z.infer<typeof movementProfileSchema>;
export type FirePolicy = z.infer<typeof firePolicySchema>;
export type GoalNoise = z.infer<typeof goalNoiseSchema>;

export const botDefinitionJsonSchema = zodToJsonSchema(botDefinitionSchema, {
  name: "BotDefinition"
});

export const botDefinitionExample: BotDefinition = {
  name: "Crossfire Fox",
  version: "2.1.0",
  author: "System",
  goals: [
    {
      id: "seek-contact",
      type: "reposition",
      priority: 78,
      weightProfile: {
        enemyVisible: -1.4,
        enemyDistance: -0.9,
        wallProximity: -0.8,
        cooldownReady: 0.2
      },
      thresholds: {
        enemyVisible: false
      },
      movementProfile: {
        preferredRange: "medium",
        throttleBias: 1,
        turnBias: 0.25,
        orbitBias: -0.2,
        dodgeBias: 0.05
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
      id: "press-attack",
      type: "attack",
      priority: 92,
      weightProfile: {
        enemyVisible: 1.7,
        enemyAlignment: 2.2,
        cooldownReady: 1.2,
        enemyDistance: 1.1,
        wallProximity: -0.6
      },
      thresholds: {
        enemyVisible: true
      },
      movementProfile: {
        preferredRange: "near",
        throttleBias: 0.9,
        turnBias: 0.15,
        orbitBias: -0.1,
        dodgeBias: 0.1
      },
      firePolicy: {
        requiresEnemyVisible: true,
        minUtilityToFire: 90,
        maxBearingOffset: Math.PI / 10,
        fireChance: 1
      },
      noise: {
        scoreJitter: 0.08
      }
    },
    {
      id: "snap-shot",
      type: "lineUpShot",
      priority: 88,
      weightProfile: {
        enemyVisible: 1.6,
        enemyAlignment: 2.4,
        cooldownReady: 1.3,
        enemyDistance: 0.8
      },
      thresholds: {
        enemyVisible: true,
        cooldownReady: true,
        enemyBearingAbsLte: Math.PI / 2
      },
      movementProfile: {
        preferredRange: "medium",
        throttleBias: 0.1,
        turnBias: 0.35,
        orbitBias: 0,
        dodgeBias: 0.05
      },
      firePolicy: {
        requiresEnemyVisible: true,
        minUtilityToFire: 90,
        maxBearingOffset: Math.PI / 14,
        fireChance: 0.98
      },
      noise: {
        scoreJitter: 0.06
      }
    },
    {
      id: "wall-reset",
      type: "unstick",
      priority: 82,
      weightProfile: {
        stuckTimer: 2.1,
        wallProximity: 1.5
      },
      thresholds: {
        stuckTimerGte: 8
      },
      movementProfile: {
        preferredRange: "far",
        throttleBias: -1,
        turnBias: 0.9,
        orbitBias: 1,
        dodgeBias: 0
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

export function validateBotDefinition(input: unknown): BotDefinition {
  return botDefinitionSchema.parse(input);
}
