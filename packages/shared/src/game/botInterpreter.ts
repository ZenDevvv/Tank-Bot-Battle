import type { BotDefinition, UtilityGoal } from "../schema/bot.js";
import type { BotSensors, TankAiMemory, TankIntent } from "./types.js";

type GoalScore = {
  goal: UtilityGoal;
  score: number;
};

type IntentChoice = {
  intent: TankIntent;
  goalId: string | null;
};

function rangePreferenceScore(preferredRange: "near" | "medium" | "far", actualRange: "near" | "medium" | "far"): number {
  if (preferredRange === actualRange) {
    return 0.75;
  }

  if (
    (preferredRange === "near" && actualRange === "medium") ||
    (preferredRange === "medium" && actualRange !== "medium") ||
    (preferredRange === "far" && actualRange === "medium")
  ) {
    return 0.2;
  }

  return -0.35;
}

function passesThresholds(goal: UtilityGoal, sensors: BotSensors): boolean {
  const thresholds = goal.thresholds;
  if (!thresholds) {
    return true;
  }

  if (thresholds.enemyVisible !== undefined && thresholds.enemyVisible !== sensors.enemyVisible) {
    return false;
  }

  if (thresholds.bulletThreat !== undefined && thresholds.bulletThreat !== sensors.bulletThreat) {
    return false;
  }

  if (thresholds.cooldownReady !== undefined && thresholds.cooldownReady !== sensors.cooldownReady) {
    return false;
  }

  if (thresholds.enemyDistanceBand && thresholds.enemyDistanceBand !== sensors.enemyDistanceBand) {
    return false;
  }

  if (thresholds.wallDistanceBand && thresholds.wallDistanceBand !== sensors.wallDistanceBand) {
    return false;
  }

  if (thresholds.healthBand && thresholds.healthBand !== sensors.healthBand) {
    return false;
  }

  if (thresholds.enemyBearingAbsLte !== undefined && Math.abs(sensors.enemyBearing) > thresholds.enemyBearingAbsLte) {
    return false;
  }

  if (thresholds.stuckTimerGte !== undefined && sensors.stuckTimer < thresholds.stuckTimerGte) {
    return false;
  }

  return true;
}

function modeBonus(goal: UtilityGoal, sensors: BotSensors, memory: TankAiMemory): number {
  let bonus = 0;

  if (sensors.stuckTimer >= 8) {
    bonus += goal.type === "unstick" ? 42 : -24;
  }

  if (sensors.enemyVisible) {
    if (goal.type === "attack") {
      bonus += 24;
    } else if (goal.type === "lineUpShot") {
      bonus += 18 + (sensors.cooldownReady ? 8 : 0);
    } else if (goal.type === "reposition") {
      bonus -= 6;
    }
  } else {
    if (goal.type === "reposition") {
      bonus += 24;
    } else if (goal.type === "attack") {
      bonus += 12;
    } else if (goal.type === "lineUpShot") {
      bonus -= 18;
    }
  }

  if (sensors.bulletThreat) {
    if (goal.type === "evade") {
      bonus += 18;
    } else if ((goal.type === "attack" || goal.type === "lineUpShot") && sensors.enemyVisible && sensors.enemyAlignment > 0.82) {
      bonus += 6;
    }
  }

  if (sensors.stalled) {
    if (goal.type === "attack" || goal.type === "lineUpShot") {
      bonus += 14;
    } else if (goal.type === "reposition") {
      bonus -= 16;
    }
  }

  if (sensors.hasRecentEnemyContact && goal.type === "attack") {
    bonus += 8;
  }

  if (memory.activeGoalId === goal.id && memory.activeGoalTicks < 36) {
    bonus += 7;
  }

  return bonus;
}

function utilityScore(goal: UtilityGoal, sensors: BotSensors, memory: TankAiMemory, rng: () => number): number {
  if (!passesThresholds(goal, sensors)) {
    return Number.NEGATIVE_INFINITY;
  }

  const weights = goal.weightProfile;
  let score = goal.priority;
  score += (weights.enemyVisible ?? 0) * (sensors.enemyVisible ? 1 : 0);
  score += (weights.enemyAlignment ?? 0) * sensors.enemyAlignment;
  score += (weights.enemyDistance ?? 0) * sensors.enemyDistance;
  score += (weights.wallProximity ?? 0) * sensors.wallProximity;
  score += (weights.bulletThreat ?? 0) * sensors.bulletThreatLevel;
  score += (weights.cooldownReady ?? 0) * (sensors.cooldownReady ? 1 : 0);
  score += (weights.stuckTimer ?? 0) * Math.min(sensors.stuckTimer / 60, 1);
  score += (weights.healthRatio ?? 0) * sensors.healthRatio;
  score += rangePreferenceScore(goal.movementProfile.preferredRange, sensors.enemyDistanceBand);
  score += modeBonus(goal, sensors, memory);

  const jitter = goal.noise?.scoreJitter ?? 0;
  if (jitter > 0) {
    score += ((rng() * 2) - 1) * jitter;
  }

  return score;
}

function normalizeDirection(value: number): -1 | 0 | 1 {
  if (value > 0.2) {
    return 1;
  }

  if (value < -0.2) {
    return -1;
  }

  return 0;
}

function preferredThrottle(
  preferredRange: "near" | "medium" | "far",
  actualRange: "near" | "medium" | "far",
  fallbackBias: number
): -1 | 0 | 1 {
  if (preferredRange === "near") {
    return actualRange === "far" ? 1 : actualRange === "near" ? 0 : 1;
  }

  if (preferredRange === "far") {
    return actualRange === "near" ? -1 : actualRange === "far" ? 0 : -1;
  }

  if (actualRange === "near") {
    return -1;
  }

  if (actualRange === "far") {
    return 1;
  }

  return normalizeDirection(fallbackBias);
}

function shouldFire(goalScore: number, goal: UtilityGoal, sensors: BotSensors, rng: () => number): boolean {
  const firePolicy = goal.firePolicy;
  if (!firePolicy) {
    return false;
  }

  if (goalScore < firePolicy.minUtilityToFire) {
    return false;
  }

  if (firePolicy.requiresEnemyVisible && !sensors.enemyVisible) {
    return false;
  }

  if (!sensors.cooldownReady) {
    return false;
  }

  if (Math.abs(sensors.interceptBearing) > firePolicy.maxBearingOffset) {
    return false;
  }

  return rng() <= firePolicy.fireChance;
}

function goalToIntent(goalScore: number, goal: UtilityGoal, sensors: BotSensors, rng: () => number): TankIntent {
  const primaryBearing = sensors.enemyVisible ? sensors.interceptBearing : sensors.searchBearing;
  const bearingSign = primaryBearing > 0 ? 1 : primaryBearing < 0 ? -1 : 0;
  let steerScore = (bearingSign * 1.1) + goal.movementProfile.turnBias;
  let throttle = preferredThrottle(goal.movementProfile.preferredRange, sensors.enemyDistanceBand, goal.movementProfile.throttleBias);

  if (goal.type === "evade") {
    const evadeTurn = sensors.searchTurnDirection === 0 ? (rng() > 0.5 ? 1 : -1) : sensors.searchTurnDirection;
    steerScore = (evadeTurn * 1.4) + goal.movementProfile.turnBias;
    throttle = sensors.wallProximity > 0.75 ? -1 : 1;
  }

  if (goal.type === "unstick") {
    const turnDirection = goal.movementProfile.turnBias || sensors.searchTurnDirection || (rng() > 0.5 ? 1 : -1);
    steerScore = turnDirection * 1.6;
    throttle = -1;
  }

  if (goal.type === "lineUpShot") {
    throttle = !sensors.enemyVisible
      ? 1
      : sensors.enemyDistanceBand === "far"
        ? 1
        : sensors.enemyDistanceBand === "near" && sensors.enemyAlignment > 0.9
          ? -1
          : 0;
    steerScore = Math.abs(primaryBearing) > 0.025 ? bearingSign * 1.8 : 0;
  }

  if (goal.type === "reposition") {
    throttle = 1;
    steerScore = (bearingSign * 1.55) + goal.movementProfile.turnBias;

    if (sensors.wallProximity > 0.78 && Math.abs(primaryBearing) < 0.16) {
      steerScore += (goal.movementProfile.orbitBias || sensors.searchTurnDirection || 1) * 0.7;
    }

    if (sensors.stalled) {
      throttle = sensors.wallProximity > 0.7 ? -1 : 1;
      steerScore = bearingSign * 1.8;
    }
  }

  if (goal.type === "attack") {
    steerScore = (bearingSign * 1.45) + goal.movementProfile.turnBias;

    if (!sensors.enemyVisible && sensors.hasRecentEnemyContact) {
      throttle = 1;
    } else if (sensors.enemyDistanceBand === "near") {
      throttle = Math.abs(primaryBearing) < 0.12 ? 0 : -1;
    } else {
      throttle = 1;
    }

    if (sensors.stalled) {
      throttle = 1;
      steerScore = bearingSign * 1.7;
    }
  }

  if (goal.movementProfile.dodgeBias > 0 && sensors.bulletThreat && goal.type !== "evade") {
    steerScore += (sensors.searchTurnDirection || (rng() > 0.5 ? 1 : -1)) * goal.movementProfile.dodgeBias;
  }

  const steer = normalizeDirection(steerScore);

  return {
    throttle,
    steer,
    fire: shouldFire(goalScore, goal, sensors, rng)
  };
}

function idleChoice(): IntentChoice {
  return {
    goalId: null,
    intent: {
      throttle: 0,
      steer: 0,
      fire: false
    }
  };
}

export function chooseIntent(
  bot: BotDefinition | undefined,
  sensors: BotSensors,
  memory: TankAiMemory,
  rng: () => number
): IntentChoice {
  if (!bot || bot.goals.length === 0) {
    return idleChoice();
  }

  const scoredGoals = bot.goals
    .map((goal): GoalScore => ({
      goal,
      score: utilityScore(goal, sensors, memory, rng)
    }))
    .filter((entry) => Number.isFinite(entry.score))
    .sort((left, right) => right.score - left.score);

  if (scoredGoals.length === 0) {
    return idleChoice();
  }

  return {
    goalId: scoredGoals[0].goal.id,
    intent: goalToIntent(scoredGoals[0].score, scoredGoals[0].goal, sensors, rng)
  };
}
