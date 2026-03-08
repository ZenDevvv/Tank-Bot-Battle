import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";

export const goalTypes = [
  "attack",
  "evade",
  "reposition",
  "unstick",
  "lineUpShot"
] as const;

export const openingTypes = [
  "fastScout",
  "wideFlankLeft",
  "wideFlankRight",
  "centerProbe",
  "holdAngle"
] as const;

export const tacticBehaviorNames = [
  "roam",
  "investigateLastSeen",
  "takeCover",
  "peekShot",
  "flank",
  "pressure",
  "retreat",
  "baitShot"
] as const;

export const bandValues = ["near", "medium", "far"] as const;
export const engagementDriveValues = ["default", "reverseBurst"] as const;
export const tankStatKeys = [
  "forwardSpeed",
  "reverseSpeed",
  "rotationSpeed",
  "fireRate",
  "bulletSpeed"
] as const;
export const TANK_STAT_BUDGET = 300;
export const DEFAULT_REVERSE_BURST_TICKS = 12;
export const DEFAULT_REVERSE_HOLD_TICKS = 4;

export const botStatsSchema = z.object({
  forwardSpeed: z.number().int().min(0).max(100),
  reverseSpeed: z.number().int().min(0).max(100),
  rotationSpeed: z.number().int().min(0).max(100),
  fireRate: z.number().int().min(0).max(100),
  bulletSpeed: z.number().int().min(0).max(100)
}).strict().superRefine((stats, context) => {
  const total = tankStatKeys.reduce((sum, key) => sum + stats[key], 0);
  if (total !== TANK_STAT_BUDGET) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: `Bot stats must total exactly ${TANK_STAT_BUDGET} points across ${tankStatKeys.join(", ")}.`,
      path: []
    });
  }
});

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
  dodgeBias: z.number().min(0).max(1).default(0),
  engagementDrive: z.enum(engagementDriveValues).default("default"),
  reverseBurstTicks: z.number().int().min(1).max(60).default(DEFAULT_REVERSE_BURST_TICKS),
  reverseHoldTicks: z.number().int().min(0).max(30).default(DEFAULT_REVERSE_HOLD_TICKS)
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

export const tacticalOpeningSchema = z.object({
  kind: z.enum(openingTypes),
  weight: z.number().min(0).max(10).default(1)
}).strict();

export const tacticThresholdSchema = z.object({
  enemyVisible: z.boolean().optional(),
  minTicksSinceEnemySeen: z.number().int().min(0).max(360).optional(),
  maxTicksSinceEnemySeen: z.number().int().min(0).max(360).optional(),
  minHealthRatio: z.number().min(0).max(1).optional(),
  maxHealthRatio: z.number().min(0).max(1).optional(),
  minExposure: z.number().min(0).max(1).optional(),
  maxExposure: z.number().min(0).max(1).optional(),
  minCoverScore: z.number().min(0).max(1).optional(),
  minFlankOpportunity: z.number().min(0).max(1).optional(),
  minBankShotOpportunity: z.number().min(0).max(1).optional()
}).strict();

export const tacticDirectiveSchema = z.object({
  weight: z.number().min(0).max(5).default(1),
  thresholds: tacticThresholdSchema.optional(),
  preferredSide: z.enum(["left", "right"]).optional()
}).strict();

export const tacticProfileSchema = z.object({
  roam: tacticDirectiveSchema.optional(),
  investigateLastSeen: tacticDirectiveSchema.optional(),
  takeCover: tacticDirectiveSchema.optional(),
  peekShot: tacticDirectiveSchema.optional(),
  flank: tacticDirectiveSchema.optional(),
  pressure: tacticDirectiveSchema.optional(),
  retreat: tacticDirectiveSchema.optional(),
  baitShot: tacticDirectiveSchema.optional()
}).strict();

export const tacticalCommitmentSchema = z.object({
  minPlanTicks: z.number().int().min(0).max(240).default(18),
  maxPlanTicks: z.number().int().min(1).max(480).default(90),
  cooldownTicks: z.number().int().min(0).max(240).default(18),
  replanOnSightChange: z.boolean().default(true),
  replanOnHit: z.boolean().default(true),
  replanOnStuck: z.boolean().default(true)
}).strict();

export const tacticalVarianceSchema = z.object({
  planJitter: z.number().min(0).max(2).default(0.15),
  rerollChance: z.number().min(0).max(1).default(0.12),
  openingMix: z.number().min(0).max(1).default(0.7)
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
}).strict().superRefine((goal, context) => {
  if (
    goal.movementProfile.engagementDrive === "reverseBurst"
    && goal.type !== "attack"
    && goal.type !== "lineUpShot"
  ) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Reverse-burst engagement is only supported on attack and lineUpShot goals.",
      path: ["movementProfile", "engagementDrive"]
    });
  }
});

export const botDefinitionSchema = z.object({
  name: z.string().min(2).max(40),
  version: z.string().min(1).max(16),
  author: z.string().min(1).max(40).optional(),
  stats: botStatsSchema,
  goals: z.array(utilityGoalSchema).max(32).default([]),
  openings: z.array(tacticalOpeningSchema).max(12).optional(),
  tactics: tacticProfileSchema.optional(),
  commitment: tacticalCommitmentSchema.optional(),
  variance: tacticalVarianceSchema.optional()
}).strict();

export type BotDefinition = z.infer<typeof botDefinitionSchema>;
export type BotStats = z.infer<typeof botStatsSchema>;
export type UtilityGoal = z.infer<typeof utilityGoalSchema>;
export type UtilityWeightProfile = z.infer<typeof utilityWeightProfileSchema>;
export type GoalThresholds = z.infer<typeof goalThresholdSchema>;
export type MovementProfile = z.infer<typeof movementProfileSchema>;
export type FirePolicy = z.infer<typeof firePolicySchema>;
export type GoalNoise = z.infer<typeof goalNoiseSchema>;
export type TacticalOpening = z.infer<typeof tacticalOpeningSchema>;
export type TacticalOpeningName = z.infer<typeof tacticalOpeningSchema>["kind"];
export type TacticThresholds = z.infer<typeof tacticThresholdSchema>;
export type TacticDirective = z.infer<typeof tacticDirectiveSchema>;
export type TacticProfile = z.infer<typeof tacticProfileSchema>;
export type TacticalCommitment = z.infer<typeof tacticalCommitmentSchema>;
export type TacticalVariance = z.infer<typeof tacticalVarianceSchema>;
export type TacticalBehaviorName = keyof TacticProfile;
export type EngagementDrive = z.infer<typeof movementProfileSchema>["engagementDrive"];

export const defaultBotStats: BotStats = {
  forwardSpeed: 60,
  reverseSpeed: 60,
  rotationSpeed: 60,
  fireRate: 60,
  bulletSpeed: 60
};

export function totalBotStats(stats: BotStats): number {
  return tankStatKeys.reduce((sum, key) => sum + stats[key], 0);
}

export const botDefinitionJsonSchema = zodToJsonSchema(botDefinitionSchema, {
  name: "BotDefinition"
});

export const botDefinitionExample: BotDefinition = {
  name: "Backstep Viper",
  version: "4.2.0",
  author: "System",
  stats: {
    forwardSpeed: 58,
    reverseSpeed: 84,
    rotationSpeed: 76,
    fireRate: 46,
    bulletSpeed: 36
  },
  openings: [
    { kind: "centerProbe", weight: 2.4 },
    { kind: "holdAngle", weight: 2 },
    { kind: "fastScout", weight: 1.6 },
    { kind: "wideFlankRight", weight: 0.9 }
  ],
  tactics: {
    roam: {
      weight: 0.8,
      thresholds: {
        enemyVisible: false,
        minTicksSinceEnemySeen: 18
      }
    },
    investigateLastSeen: {
      weight: 1.95,
      thresholds: {
        enemyVisible: false,
        maxTicksSinceEnemySeen: 80
      }
    },
    takeCover: {
      weight: 1.5,
      thresholds: {
        enemyVisible: true,
        minExposure: 0.45
      }
    },
    peekShot: {
      weight: 2.15,
      thresholds: {
        enemyVisible: true,
        minCoverScore: 0.2
      }
    },
    flank: {
      weight: 1.5,
      preferredSide: "left",
      thresholds: {
        minFlankOpportunity: 0.2,
        maxTicksSinceEnemySeen: 54
      }
    },
    pressure: {
      weight: 0.72,
      thresholds: {
        enemyVisible: true,
        minHealthRatio: 0.55,
        maxExposure: 0.5
      }
    },
    retreat: {
      weight: 1.45,
      thresholds: {
        enemyVisible: true,
        minExposure: 0.28
      }
    },
    baitShot: {
      weight: 1.95,
      thresholds: {
        enemyVisible: true,
        minCoverScore: 0.18
      }
    }
  },
  commitment: {
    minPlanTicks: 12,
    maxPlanTicks: 60,
    cooldownTicks: 14,
    replanOnSightChange: true,
    replanOnHit: true,
    replanOnStuck: true
  },
  variance: {
    planJitter: 0.24,
    rerollChance: 0.18,
    openingMix: 0.58
  },
  goals: [
    {
      id: "kite-hunt",
      type: "reposition",
      priority: 84,
      weightProfile: {
        enemyVisible: -1.2,
        enemyDistance: -1.1,
        wallProximity: -0.8,
        cooldownReady: 0.3
      },
      thresholds: {
        enemyVisible: false
      },
      movementProfile: {
        preferredRange: "medium",
        throttleBias: 1,
        turnBias: 0.5,
        orbitBias: 0.3,
        dodgeBias: 0.15,
        engagementDrive: "default",
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
      id: "panic-slide",
      type: "evade",
      priority: 95,
      weightProfile: {
        enemyVisible: 1.4,
        bulletThreat: 2.1,
        enemyDistance: 1.2,
        wallProximity: -0.8,
        cooldownReady: 0.5
      },
      thresholds: {
        enemyVisible: true,
        enemyDistanceBand: "near"
      },
      movementProfile: {
        preferredRange: "far",
        throttleBias: -1,
        turnBias: 0.4,
        orbitBias: 0.8,
        dodgeBias: 0.95,
        engagementDrive: "default",
        reverseBurstTicks: 12,
        reverseHoldTicks: 4
      },
      firePolicy: {
        requiresEnemyVisible: true,
        minUtilityToFire: 94,
        maxBearingOffset: Math.PI / 9,
        fireChance: 0.82
      },
      noise: {
        scoreJitter: 0.05
      }
    },
    {
      id: "backpedal-burst",
      type: "lineUpShot",
      priority: 104,
      weightProfile: {
        enemyVisible: 1.8,
        enemyAlignment: 2.9,
        cooldownReady: 1.6,
        enemyDistance: 1.4,
        wallProximity: -0.7
      },
      thresholds: {
        enemyVisible: true,
        enemyBearingAbsLte: Math.PI / 2
      },
      movementProfile: {
        preferredRange: "far",
        throttleBias: -0.8,
        turnBias: 0.2,
        orbitBias: 0.3,
        dodgeBias: 0.3,
        engagementDrive: "reverseBurst",
        reverseBurstTicks: 12,
        reverseHoldTicks: 4
      },
      firePolicy: {
        requiresEnemyVisible: true,
        minUtilityToFire: 90,
        maxBearingOffset: Math.PI / 8,
        fireChance: 0.97
      },
      noise: {
        scoreJitter: 0.06
      }
    },
    {
      id: "retreat-fire",
      type: "attack",
      priority: 97,
      weightProfile: {
        enemyVisible: 1.7,
        enemyAlignment: 1.8,
        cooldownReady: 1.2,
        enemyDistance: 1.25,
        wallProximity: -0.6
      },
      thresholds: {
        enemyVisible: true
      },
      movementProfile: {
        preferredRange: "far",
        throttleBias: -0.75,
        turnBias: 0.1,
        orbitBias: 0.25,
        dodgeBias: 0.35,
        engagementDrive: "reverseBurst",
        reverseBurstTicks: 12,
        reverseHoldTicks: 4
      },
      firePolicy: {
        requiresEnemyVisible: true,
        minUtilityToFire: 84,
        maxBearingOffset: Math.PI / 8,
        fireChance: 0.9
      },
      noise: {
        scoreJitter: 0.05
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
        dodgeBias: 0,
        engagementDrive: "default",
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

export function validateBotDefinition(input: unknown): BotDefinition {
  return botDefinitionSchema.parse(input);
}
