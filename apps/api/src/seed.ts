import { botDefinitionExample, fixedMaps, type BotDefinition } from "@tank-bot-battle/shared";
import { BotModel } from "./models/Bot.js";
import { MapModel } from "./models/Map.js";

const systemBots: BotDefinition[] = [
  botDefinitionExample,
  {
    name: "Ricochet Lynx",
    version: "4.0.0",
    author: "System",
    stats: {
      forwardSpeed: 78,
      reverseSpeed: 42,
      rotationSpeed: 56,
      fireRate: 64,
      bulletSpeed: 60
    },
    openings: [
      { kind: "fastScout", weight: 2.1 },
      { kind: "centerProbe", weight: 1.8 },
      { kind: "wideFlankRight", weight: 1.4 }
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
        preferredSide: "right",
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
        type: "reposition",
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
        preferredRange: "medium",
        throttleBias: 1,
        turnBias: 0.45,
        orbitBias: 0.15,
        dodgeBias: 0.05,
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
        id: "bank-shot-window",
        type: "lineUpShot",
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
        preferredRange: "medium",
        throttleBias: 0.15,
        turnBias: 0.45,
        orbitBias: 0,
        dodgeBias: 0.05,
        engagementDrive: "default",
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
        type: "attack",
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
        type: "unstick",
        priority: 84,
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
        orbitBias: 0.8,
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
  }
];

export async function seedStaticContent(): Promise<void> {
  for (const map of fixedMaps) {
    await MapModel.updateOne(
      { mapId: map.id },
      {
        mapId: map.id,
        name: map.name,
        width: map.width,
        height: map.height,
        spawnPoints: map.spawnPoints,
        walls: map.walls
      },
      { upsert: true }
    );
  }

  for (const definition of systemBots) {
    await BotModel.updateOne(
      { isSystem: true, name: definition.name },
      {
        isSystem: true,
        name: definition.name,
        version: definition.version,
        author: definition.author,
        definition
      },
      { upsert: true }
    );
  }

  await BotModel.deleteMany({
    isSystem: true,
    name: { $nin: systemBots.map((definition) => definition.name) }
  });
}
