import {
  DEFAULT_REVERSE_BURST_TICKS,
  DEFAULT_REVERSE_HOLD_TICKS,
  tacticBehaviorNames,
  type BotDefinition,
  type TacticDirective,
  type TacticalBehaviorName,
  type TacticalCommitment,
  type TacticalOpeningName,
  type TacticalVariance,
  type UtilityGoal
} from "../schema/bot.js";
import type { BotSensors, TankAiMemory, TankIntent } from "./types.js";

type GoalScore = {
  goal: UtilityGoal;
  score: number;
};

type IntentChoice = {
  intent: TankIntent;
  goalId: string | null;
};

type WeightedEntry<T> = {
  value: T;
  weight: number;
};

const defaultCommitment: TacticalCommitment = {
  minPlanTicks: 18,
  maxPlanTicks: 90,
  cooldownTicks: 18,
  replanOnSightChange: true,
  replanOnHit: true,
  replanOnStuck: true
};

const defaultVariance: TacticalVariance = {
  planJitter: 0.15,
  rerollChance: 0.12,
  openingMix: 0.7
};

function commitmentFor(bot: BotDefinition): TacticalCommitment {
  return {
    ...defaultCommitment,
    ...bot.commitment
  };
}

function varianceFor(bot: BotDefinition): TacticalVariance {
  return {
    ...defaultVariance,
    ...bot.variance
  };
}

function hasTacticalAuthoring(bot: BotDefinition): boolean {
  return Boolean(
    (bot.openings && bot.openings.length > 0)
    || (bot.tactics && tacticBehaviorNames.some((name) => (bot.tactics?.[name]?.weight ?? 0) > 0))
  );
}

function weightedPick<T>(entries: WeightedEntry<T>[], rng: () => number): T | null {
  const validEntries = entries.filter((entry) => entry.weight > 0);
  if (validEntries.length === 0) {
    return null;
  }

  const totalWeight = validEntries.reduce((sum, entry) => sum + entry.weight, 0);
  let cursor = rng() * totalWeight;
  for (const entry of validEntries) {
    cursor -= entry.weight;
    if (cursor <= 0) {
      return entry.value;
    }
  }

  return validEntries[validEntries.length - 1]?.value ?? null;
}

function hasReverseBurstState(memory: TankAiMemory): boolean {
  return memory.reverseBurstTicksRemaining > 0 || memory.reverseHoldTicksRemaining > 0;
}

function resetReverseBurst(memory: TankAiMemory): void {
  memory.reverseBurstTicksRemaining = 0;
  memory.reverseHoldTicksRemaining = 0;
}

function updateReverseEscapeUnsafeTicks(memory: TankAiMemory, sensors: BotSensors): void {
  memory.reverseEscapeUnsafeTicks = sensors.reverseEscapeSafety < 0.15
    ? memory.reverseEscapeUnsafeTicks + 1
    : 0;
}

function isReverseBurstGoal(goal: UtilityGoal): boolean {
  return goal.movementProfile.engagementDrive === "reverseBurst";
}

function rangePreferenceScore(preferredRange: "near" | "medium" | "far", actualRange: "near" | "medium" | "far"): number {
  if (preferredRange === actualRange) {
    return 0.75;
  }

  if (
    (preferredRange === "near" && actualRange === "medium")
    || (preferredRange === "medium" && actualRange !== "medium")
    || (preferredRange === "far" && actualRange === "medium")
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

function passesTacticThresholds(directive: TacticDirective | undefined, sensors: BotSensors): boolean {
  const thresholds = directive?.thresholds;
  if (!thresholds) {
    return true;
  }

  if (thresholds.enemyVisible !== undefined && thresholds.enemyVisible !== sensors.enemyVisible) {
    return false;
  }

  if (thresholds.minTicksSinceEnemySeen !== undefined && sensors.ticksSinceEnemySeen < thresholds.minTicksSinceEnemySeen) {
    return false;
  }

  if (thresholds.maxTicksSinceEnemySeen !== undefined && sensors.ticksSinceEnemySeen > thresholds.maxTicksSinceEnemySeen) {
    return false;
  }

  if (thresholds.minHealthRatio !== undefined && sensors.healthRatio < thresholds.minHealthRatio) {
    return false;
  }

  if (thresholds.maxHealthRatio !== undefined && sensors.healthRatio > thresholds.maxHealthRatio) {
    return false;
  }

  if (thresholds.minExposure !== undefined && sensors.exposureScore < thresholds.minExposure) {
    return false;
  }

  if (thresholds.maxExposure !== undefined && sensors.exposureScore > thresholds.maxExposure) {
    return false;
  }

  if (thresholds.minCoverScore !== undefined && sensors.coverScore < thresholds.minCoverScore) {
    return false;
  }

  if (thresholds.minFlankOpportunity !== undefined && sensors.flankOpportunity < thresholds.minFlankOpportunity) {
    return false;
  }

  if (thresholds.minBankShotOpportunity !== undefined && sensors.bankShotOpportunity < thresholds.minBankShotOpportunity) {
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

  if (
    isReverseBurstGoal(goal)
    && memory.activeGoalId === goal.id
    && hasReverseBurstState(memory)
  ) {
    bonus += 26;
  }

  if (
    isReverseBurstGoal(goal)
    && !hasReverseBurstState(memory)
    && canStartReverseBurst(goal, sensors, memory)
  ) {
    bonus += 22;
    if (sensors.enemyDistanceBand !== "near") {
      bonus += 6;
    }
  }

  return bonus;
}

function tacticGoalBias(tactic: TacticalBehaviorName | null, goal: UtilityGoal, sensors: BotSensors): number {
  if (!tactic) {
    return 0;
  }

  const reverseBurstGoal = isReverseBurstGoal(goal);

  switch (tactic) {
    case "roam":
      if (goal.type === "reposition") {
        return 18;
      }
      if (goal.type === "attack") {
        return -8;
      }
      if (goal.type === "lineUpShot") {
        return -12;
      }
      return 0;
    case "investigateLastSeen":
      if (goal.type === "reposition") {
        return 14;
      }
      if (goal.type === "attack" && sensors.hasRecentEnemyContact) {
        return 10;
      }
      return 0;
    case "takeCover":
      if (reverseBurstGoal) {
        return goal.type === "lineUpShot" ? 18 : 10;
      }
      if (goal.type === "evade") {
        return 16;
      }
      if (goal.type === "reposition") {
        return 12;
      }
      return goal.type === "attack" ? -10 : -4;
    case "peekShot":
      if (reverseBurstGoal) {
        return goal.type === "lineUpShot" ? 28 : 16;
      }
      if (goal.type === "lineUpShot") {
        return 22;
      }
      if (goal.type === "attack") {
        return 8;
      }
      return 0;
    case "flank":
      if (goal.type === "reposition") {
        return 10;
      }
      if (goal.type === "attack") {
        return 16;
      }
      if (goal.type === "lineUpShot") {
        return 10;
      }
      return 0;
    case "pressure":
      if (reverseBurstGoal && sensors.enemyDistanceBand !== "near") {
        return goal.type === "lineUpShot" ? 18 : 12;
      }
      if (goal.type === "attack") {
        return 20;
      }
      if (goal.type === "lineUpShot") {
        return 10;
      }
      return goal.type === "reposition" ? -4 : 0;
    case "retreat":
      if (reverseBurstGoal) {
        return goal.type === "lineUpShot" ? 26 : 20;
      }
      if (goal.type === "evade") {
        return 14;
      }
      if (goal.type === "reposition") {
        return 4;
      }
      return goal.type === "attack" ? -4 : 0;
    case "baitShot":
      if (reverseBurstGoal) {
        return goal.type === "lineUpShot" ? 22 : 14;
      }
      if (goal.type === "lineUpShot") {
        return 14;
      }
      if (goal.type === "evade") {
        return 8;
      }
      if (goal.type === "attack") {
        return 4;
      }
      return 0;
    default:
      return 0;
  }
}

function utilityScore(
  goal: UtilityGoal,
  sensors: BotSensors,
  memory: TankAiMemory,
  rng: () => number,
  activeTactic: TacticalBehaviorName | null
): number {
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
  score += tacticGoalBias(activeTactic, goal, sensors);

  const jitter = goal.noise?.scoreJitter ?? 0;
  if (jitter > 0) {
    score += ((rng() * 2) - 1) * jitter;
  }

  return score;
}

function hasImmediateReverseBurstOpportunity(bot: BotDefinition, sensors: BotSensors, memory: TankAiMemory): boolean {
  return bot.goals.some((goal) => (
    isReverseBurstGoal(goal)
    && passesThresholds(goal, sensors)
    && canStartReverseBurst(goal, sensors, memory)
  ));
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

function normalizeAngle(angle: number): number {
  let next = angle;
  while (next > Math.PI) {
    next -= Math.PI * 2;
  }
  while (next < -Math.PI) {
    next += Math.PI * 2;
  }
  return next;
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

function reverseBurstTriggerLimit(goal: UtilityGoal): number {
  return goal.firePolicy?.maxBearingOffset ?? (Math.PI / 10);
}

function reverseBurstCancelLimit(goal: UtilityGoal): number {
  const triggerLimit = reverseBurstTriggerLimit(goal);
  return Math.min(Math.PI / 2, triggerLimit + (Math.PI / 16));
}

function canStartReverseBurst(goal: UtilityGoal, sensors: BotSensors, memory: TankAiMemory): boolean {
  return sensors.enemyVisible
    && sensors.stuckTimer < 6
    && memory.reverseEscapeUnsafeTicks < 3;
}

function shouldCancelReverseBurst(goal: UtilityGoal, sensors: BotSensors, memory: TankAiMemory): boolean {
  return !sensors.enemyVisible
    || sensors.stuckTimer >= 8
    || memory.reverseEscapeUnsafeTicks >= 3;
}

function reverseNavigationWeight(safety: number): number {
  if (safety >= 0.6) {
    return 0;
  }

  if (safety >= 0.3) {
    return 0.45;
  }

  return 0.8;
}

function blendBearings(primaryBearing: number, secondaryBearing: number, secondaryWeight: number): number {
  return normalizeAngle((primaryBearing * (1 - secondaryWeight)) + (secondaryBearing * secondaryWeight));
}

function resolveReverseBurstGuidance(goal: UtilityGoal, sensors: BotSensors): { guidanceBearing: number; fireSuppressed: boolean } {
  const navigationWeight = reverseNavigationWeight(sensors.reverseEscapeSafety);
  const guidanceBearing = navigationWeight === 0
    ? sensors.interceptBearing
    : blendBearings(sensors.interceptBearing, sensors.reverseEscapeBearing, navigationWeight);

  return {
    guidanceBearing,
    fireSuppressed: navigationWeight > 0 && Math.abs(sensors.reverseEscapeBearing) > reverseBurstTriggerLimit(goal)
  };
}

function resolveReverseBurstThrottle(
  goal: UtilityGoal,
  sensors: BotSensors,
  memory: TankAiMemory
): -1 | 0 | null {
  if (goal.movementProfile.engagementDrive !== "reverseBurst") {
    resetReverseBurst(memory);
    return null;
  }

  if (hasReverseBurstState(memory) && shouldCancelReverseBurst(goal, sensors, memory)) {
    resetReverseBurst(memory);
    return null;
  }

  if (memory.reverseBurstTicksRemaining > 0) {
    memory.reverseBurstTicksRemaining -= 1;
    if (memory.reverseBurstTicksRemaining === 0) {
      memory.reverseHoldTicksRemaining = goal.movementProfile.reverseHoldTicks ?? DEFAULT_REVERSE_HOLD_TICKS;
    }
    return -1;
  }

  if (memory.reverseHoldTicksRemaining > 0) {
    memory.reverseHoldTicksRemaining -= 1;
    return 0;
  }

  if (!canStartReverseBurst(goal, sensors, memory)) {
    return null;
  }

  memory.reverseBurstTicksRemaining = Math.max((goal.movementProfile.reverseBurstTicks ?? DEFAULT_REVERSE_BURST_TICKS) - 1, 0);
  memory.reverseHoldTicksRemaining = 0;
  return -1;
}

function resolvePinnedReverseBurstGoal(
  bot: BotDefinition,
  sensors: BotSensors,
  memory: TankAiMemory
): UtilityGoal | null {
  if (!hasReverseBurstState(memory) || !memory.activeGoalId) {
    return null;
  }

  const goal = bot.goals.find((entry) => entry.id === memory.activeGoalId);
  if (!goal || !isReverseBurstGoal(goal)) {
    resetReverseBurst(memory);
    return null;
  }

  if (shouldCancelReverseBurst(goal, sensors, memory)) {
    resetReverseBurst(memory);
    return null;
  }

  return goal;
}

function selectOpening(bot: BotDefinition, memory: TankAiMemory, rng: () => number): void {
  if (memory.openingChoice || !bot.openings || bot.openings.length === 0) {
    return;
  }

  const opening = weightedPick(
    bot.openings.map((entry) => ({
      value: entry.kind,
      weight: entry.weight
    })),
    rng
  );

  if (!opening) {
    return;
  }

  memory.openingChoice = opening;
  memory.openingTicksRemaining = Math.max(commitmentFor(bot).minPlanTicks, 24);
  if (opening === "wideFlankLeft") {
    memory.preferredFlankDirection = -1;
  } else if (opening === "wideFlankRight") {
    memory.preferredFlankDirection = 1;
  }
}

function openingPreferredTactic(opening: TacticalOpeningName | null): TacticalBehaviorName | null {
  switch (opening) {
    case "fastScout":
      return "roam";
    case "wideFlankLeft":
    case "wideFlankRight":
      return "flank";
    case "centerProbe":
      return "pressure";
    case "holdAngle":
      return "takeCover";
    default:
      return null;
  }
}

function sideFromPreference(preferredSide: "left" | "right" | undefined): -1 | 1 | 0 {
  if (preferredSide === "left") {
    return -1;
  }

  if (preferredSide === "right") {
    return 1;
  }

  return 0;
}

function tacticHeuristic(name: TacticalBehaviorName, sensors: BotSensors): number {
  switch (name) {
    case "roam":
      return (!sensors.enemyVisible ? 24 : -16)
        + (sensors.routeSafety * 12)
        + ((1 - sensors.exposureScore) * 10)
        + (sensors.ticksSinceEnemySeen > 30 ? 8 : -2);
    case "investigateLastSeen":
      return (!sensors.enemyVisible ? 18 : -14)
        + (sensors.hasRecentEnemyContact ? 16 : 4)
        + (Math.max(0, 1 - (sensors.ticksSinceEnemySeen / 90)) * 12)
        + (sensors.routeSafety * 10);
    case "takeCover":
      return (sensors.enemyVisible ? 14 : 2)
        + (sensors.exposureScore * 20)
        + ((1 - sensors.healthRatio) * 14)
        + (sensors.bulletThreatLevel * 12)
        + (sensors.coverScore * 12);
    case "peekShot":
      return (sensors.enemyVisible ? 16 : 4)
        + (sensors.coverScore * 16)
        + (sensors.enemyAlignment * 10)
        + (sensors.bankShotOpportunity * 10)
        + (sensors.cooldownReady ? 6 : 0);
    case "flank":
      return (sensors.flankOpportunity * 22)
        + (sensors.routeSafety * 12)
        + (!sensors.enemyVisible ? 10 : 4)
        + ((1 - sensors.exposureScore) * 6);
    case "pressure":
      return (sensors.enemyVisible ? 18 : 6)
        + (sensors.healthRatio * 12)
        + ((1 - sensors.bulletThreatLevel) * 12)
        + (sensors.enemyDistanceBand === "far" ? 6 : sensors.enemyDistanceBand === "medium" ? 4 : -2)
        - (sensors.exposureScore * 8);
    case "retreat":
      return ((1 - sensors.healthRatio) * 18)
        + (sensors.bulletThreatLevel * 12)
        + (sensors.enemyDistanceBand === "near" ? 10 : 0)
        + (sensors.coverScore * 10);
    case "baitShot":
      return (sensors.coverScore * 16)
        + (sensors.enemyVisible ? 10 : 0)
        + (sensors.cooldownReady ? 2 : 7)
        + (sensors.enemyDistanceBand !== "far" ? 4 : 0);
    default:
      return 0;
  }
}

function shouldHoldCurrentTactic(bot: BotDefinition, sensors: BotSensors, memory: TankAiMemory): boolean {
  const currentTactic = memory.activeTacticId;
  if (!currentTactic || !bot.tactics?.[currentTactic]) {
    return false;
  }

  const commitment = commitmentFor(bot);
  const sightChanged = commitment.replanOnSightChange
    && sensors.enemyVisible !== memory.lastEnemyVisible
    && memory.activeTacticTicks >= Math.max(6, Math.floor(commitment.minPlanTicks / 2));
  const recentHit = commitment.replanOnHit && memory.ticksSinceLastHit === 0;
  const stuck = commitment.replanOnStuck && (sensors.stuckTimer >= 8 || sensors.stalled);
  const reverseOpportunity = sensors.enemyVisible
    && hasImmediateReverseBurstOpportunity(bot, sensors, memory)
    && (currentTactic === "roam" || currentTactic === "investigateLastSeen");

  if (memory.activeTacticTicks < commitment.minPlanTicks && !(sightChanged || recentHit || stuck || reverseOpportunity)) {
    return true;
  }

  return false;
}

function selectTactic(bot: BotDefinition, sensors: BotSensors, memory: TankAiMemory, rng: () => number): TacticalBehaviorName | null {
  if (!bot.tactics) {
    return null;
  }

  selectOpening(bot, memory, rng);

  if (shouldHoldCurrentTactic(bot, sensors, memory)) {
    return memory.activeTacticId;
  }

  const commitment = commitmentFor(bot);
  const variance = varianceFor(bot);
  const openingPreferred = memory.openingTicksRemaining > 0 ? openingPreferredTactic(memory.openingChoice) : null;

  const scoredTactics = tacticBehaviorNames
    .map((name) => {
      const directive = bot.tactics?.[name];
      if (!directive || directive.weight <= 0 || !passesTacticThresholds(directive, sensors)) {
        return { name, score: Number.NEGATIVE_INFINITY, directive };
      }

      if (memory.tacticCooldowns[name] > 0 && memory.activeTacticId !== name) {
        return { name, score: Number.NEGATIVE_INFINITY, directive };
      }

      let score = directive.weight * 18;
      score += tacticHeuristic(name, sensors);

      if (openingPreferred === name) {
        score += 18 * variance.openingMix;
      }

      if (memory.activeTacticId === name) {
        score += 6;
      }

      if (memory.lastCompletedTacticId === name) {
        score -= 4;
      }

      if (name === "flank") {
        const preferredSide = sideFromPreference(directive.preferredSide);
        if (preferredSide !== 0) {
          memory.preferredFlankDirection = preferredSide;
        }
      }

      if (variance.planJitter > 0) {
        score += ((rng() * 2) - 1) * variance.planJitter;
      }

      return { name, score, directive };
    })
    .filter((entry) => Number.isFinite(entry.score))
    .sort((left, right) => right.score - left.score);

  if (scoredTactics.length === 0) {
    return memory.activeTacticId;
  }

  const topScore = scoredTactics[0].score;
  const contenderFloor = topScore - 10;
  const contenders = scoredTactics.filter((entry) => entry.score >= contenderFloor);
  const chosen = weightedPick(
    contenders.map((entry) => ({
      value: entry.name,
      weight: Math.max(0.1, entry.score - contenderFloor + 1)
    })),
    rng
  ) ?? contenders[0].name;

  const previous = memory.activeTacticId;
  if (previous !== chosen) {
    if (previous) {
      memory.lastCompletedTacticId = previous;
      memory.tacticCooldowns[previous] = commitment.cooldownTicks;
    }
    memory.activeTacticId = chosen;
    memory.activeTacticTicks = 0;
  }

  const flankPreference = sideFromPreference(bot.tactics[chosen]?.preferredSide);
  if (flankPreference !== 0) {
    memory.preferredFlankDirection = flankPreference;
  }

  return memory.activeTacticId;
}

function resolvePrimaryBearing(tactic: TacticalBehaviorName | null, sensors: BotSensors, memory: TankAiMemory): number {
  switch (tactic) {
    case "roam":
      return sensors.roamBearing;
    case "investigateLastSeen":
      return sensors.investigateBearing;
    case "takeCover":
      return sensors.coverBearing;
    case "peekShot":
      return sensors.enemyVisible
        ? sensors.interceptBearing
        : (sensors.bankShotOpportunity > 0.55 ? sensors.bankShotBearing : sensors.peekBearing);
    case "flank":
      return memory.preferredFlankDirection < 0 ? sensors.flankLeftBearing : sensors.flankRightBearing;
    case "pressure":
      return sensors.enemyVisible
        ? sensors.interceptBearing
        : (sensors.bankShotOpportunity > 0.72 ? sensors.bankShotBearing : sensors.searchBearing);
    case "retreat":
      return sensors.retreatBearing;
    case "baitShot":
      return sensors.baitBearing;
    default:
      return sensors.enemyVisible ? sensors.interceptBearing : sensors.searchBearing;
  }
}

function shouldFire(
  goalScore: number,
  goal: UtilityGoal,
  tactic: TacticalBehaviorName | null,
  sensors: BotSensors,
  memory: TankAiMemory,
  rng: () => number
): boolean {
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

  const effectiveBearing = !sensors.enemyVisible && sensors.bankShotOpportunity > 0.65
    ? sensors.bankShotBearing
    : sensors.interceptBearing;

  if (Math.abs(effectiveBearing) > firePolicy.maxBearingOffset) {
    return false;
  }

  if (tactic === "takeCover" && sensors.exposureScore > 0.75 && sensors.healthRatio < 0.55) {
    return false;
  }

  if (tactic === "baitShot" && memory.activeTacticTicks % 24 < 10) {
    return false;
  }

  if (tactic === "flank" && !sensors.enemyVisible && sensors.bankShotOpportunity < 0.75) {
    return false;
  }

  return rng() <= firePolicy.fireChance;
}

function goalToIntent(
  goalScore: number,
  goal: UtilityGoal,
  tactic: TacticalBehaviorName | null,
  sensors: BotSensors,
  memory: TankAiMemory,
  rng: () => number
): TankIntent {
  const primaryBearing = resolvePrimaryBearing(tactic, sensors, memory);
  const bearingSign = primaryBearing > 0 ? 1 : primaryBearing < 0 ? -1 : 0;
  const combatBearing = sensors.enemyVisible ? sensors.interceptBearing : primaryBearing;
  let fireSuppressedByReverseNavigation = false;
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

  if (goal.type !== "unstick") {
    switch (tactic) {
      case "roam":
        throttle = 1;
        steerScore = (bearingSign * 1.55) + (memory.searchTurnDirection * 0.3) + goal.movementProfile.turnBias;
        break;
      case "investigateLastSeen":
        throttle = 1;
        steerScore = (bearingSign * 1.6) + goal.movementProfile.turnBias;
        break;
      case "takeCover":
        throttle = sensors.coverScore > 0.85 && sensors.enemyVisible ? 0 : (Math.abs(primaryBearing) > 0.7 ? 0 : 1);
        steerScore = (bearingSign * 1.85) + goal.movementProfile.turnBias;
        break;
      case "peekShot":
        throttle = sensors.coverScore > 0.35 && sensors.enemyVisible ? 0 : 1;
        steerScore = Math.abs(primaryBearing) > 0.03 ? bearingSign * 1.9 : 0;
        break;
      case "flank":
        throttle = 1;
        steerScore = (bearingSign * 1.85) + (memory.preferredFlankDirection * 0.35);
        break;
    case "pressure":
      if (sensors.enemyDistanceBand === "near") {
        throttle = sensors.enemyAlignment > 0.94 && sensors.cooldownReady ? 0 : -1;
      } else {
        throttle = 1;
      }
      steerScore = (bearingSign * 1.6) + goal.movementProfile.turnBias;
      break;
      case "retreat":
        throttle = Math.abs(primaryBearing) > 1 ? 0 : 1;
        if (sensors.enemyVisible && sensors.enemyDistanceBand === "near" && Math.abs(primaryBearing) < 0.35) {
          throttle = -1;
        }
        steerScore = (bearingSign * 1.95) + goal.movementProfile.turnBias;
        break;
      case "baitShot":
        throttle = memory.activeTacticTicks % 24 < 12 ? 1 : -1;
        steerScore = (bearingSign * 1.45) + (memory.preferredFlankDirection * 0.2) + goal.movementProfile.turnBias;
        break;
      default:
        break;
    }
  }

  if (goal.movementProfile.dodgeBias > 0 && sensors.bulletThreat && goal.type !== "evade") {
    steerScore += (sensors.searchTurnDirection || (rng() > 0.5 ? 1 : -1)) * goal.movementProfile.dodgeBias;
  }

  if (
    sensors.enemyVisible
    && sensors.stuckTimer >= 6
    && throttle === 0
    && (goal.type === "attack" || goal.type === "lineUpShot")
  ) {
    throttle = isReverseBurstGoal(goal) && (sensors.wallProximity >= 0.72 || sensors.stuckTimer >= 8)
      ? 1
      : isReverseBurstGoal(goal)
        ? -1
        : (sensors.enemyDistanceBand === "near" ? -1 : 1);
    if (Math.abs(combatBearing) < 0.16) {
      steerScore += (memory.searchTurnDirection || (rng() > 0.5 ? 1 : -1)) * 0.85;
    }
  }

  const reverseBurstThrottle = resolveReverseBurstThrottle(goal, sensors, memory);
  if (reverseBurstThrottle !== null) {
    const reverseGuidance = resolveReverseBurstGuidance(goal, sensors);
    const reverseGuidanceSign = reverseGuidance.guidanceBearing > 0 ? 1 : reverseGuidance.guidanceBearing < 0 ? -1 : 0;
    throttle = reverseBurstThrottle;
    steerScore = Math.abs(reverseGuidance.guidanceBearing) > 0.02 ? reverseGuidanceSign * 1.9 : 0;
    fireSuppressedByReverseNavigation = reverseGuidance.fireSuppressed;
  }

  const steer = normalizeDirection(steerScore);

  return {
    throttle,
    steer,
    fire: !fireSuppressedByReverseNavigation && shouldFire(goalScore, goal, tactic, sensors, memory, rng)
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
    resetReverseBurst(memory);
    return idleChoice();
  }

  updateReverseEscapeUnsafeTicks(memory, sensors);

  const pinnedReverseGoal = resolvePinnedReverseBurstGoal(bot, sensors, memory);
  const activeTactic = pinnedReverseGoal
    ? memory.activeTacticId
    : hasTacticalAuthoring(bot)
      ? selectTactic(bot, sensors, memory, rng)
      : null;

  if (pinnedReverseGoal) {
    memory.lastEnemyVisible = sensors.enemyVisible;
    return {
      goalId: pinnedReverseGoal.id,
      intent: goalToIntent(
        Math.max(pinnedReverseGoal.priority, pinnedReverseGoal.firePolicy?.minUtilityToFire ?? pinnedReverseGoal.priority),
        pinnedReverseGoal,
        activeTactic,
        sensors,
        memory,
        rng
      )
    };
  }

  const scoredGoals = bot.goals
    .map((goal): GoalScore => ({
      goal,
      score: utilityScore(goal, sensors, memory, rng, activeTactic)
    }))
    .filter((entry) => Number.isFinite(entry.score))
    .sort((left, right) => right.score - left.score);

  memory.lastEnemyVisible = sensors.enemyVisible;

  if (scoredGoals.length === 0) {
    resetReverseBurst(memory);
    return idleChoice();
  }

  if (scoredGoals[0].goal.movementProfile.engagementDrive !== "reverseBurst") {
    resetReverseBurst(memory);
  }

  return {
    goalId: scoredGoals[0].goal.id,
    intent: goalToIntent(scoredGoals[0].score, scoredGoals[0].goal, activeTactic, sensors, memory, rng)
  };
}
