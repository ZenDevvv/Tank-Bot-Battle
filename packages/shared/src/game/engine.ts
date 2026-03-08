import {
  BULLET_LIFETIME_TICKS,
  BULLET_RADIUS,
  MAX_BOUNCES,
  MAX_TICKS,
  TANK_MAX_HEALTH,
  TANK_RADIUS
} from "./constants.js";
import { defaultBotStats, TANK_STAT_BUDGET, tankStatKeys, type BotStats } from "../schema/bot.js";
import { chooseIntent } from "./botInterpreter.js";
import type {
  ArenaMap,
  BattleSession,
  BotSensors,
  BulletState,
  EngineInput,
  ImpactEffect,
  MatchReason,
  MatchResult,
  MatchSnapshot,
  Rect,
  ResolvedTankStats,
  TankIntent,
  TankState,
  Vector2
} from "./types.js";

function length(vector: Vector2): number {
  return Math.sqrt((vector.x * vector.x) + (vector.y * vector.y));
}

function distanceBetween(from: Vector2, to: Vector2): number {
  return length({
    x: to.x - from.x,
    y: to.y - from.y
  });
}

function isBotStats(value: unknown): value is BotStats {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Record<string, unknown>;
  return tankStatKeys.every((key) => {
    const stat = candidate[key];
    return Number.isInteger(stat) && Number(stat) >= 0 && Number(stat) <= 100;
  }) && tankStatKeys.reduce((sum, key) => sum + Number(candidate[key]), 0) === TANK_STAT_BUDGET;
}

function resolveBaseStats(stats: BotStats | undefined): BotStats {
  return isBotStats(stats) ? stats : defaultBotStats;
}

export function resolveTankStats(baseStats: BotStats): ResolvedTankStats {
  return {
    forwardSpeed: 1.6 + (0.02 * baseStats.forwardSpeed),
    reverseSpeed: 0.9 + (0.015 * baseStats.reverseSpeed),
    rotationSpeed: 0.026 + (0.0003 * baseStats.rotationSpeed),
    shotCooldownTicks: Math.round(36 - (0.2 * baseStats.fireRate)),
    bulletSpeed: 4 + (0.03 * baseStats.bulletSpeed)
  };
}

function midpoint(a: Vector2, b: Vector2): Vector2 {
  return {
    x: (a.x + b.x) / 2,
    y: (a.y + b.y) / 2
  };
}

function subtract(left: Vector2, right: Vector2): Vector2 {
  return {
    x: left.x - right.x,
    y: left.y - right.y
  };
}

function add(left: Vector2, right: Vector2): Vector2 {
  return {
    x: left.x + right.x,
    y: left.y + right.y
  };
}

function scale(vector: Vector2, factor: number): Vector2 {
  return {
    x: vector.x * factor,
    y: vector.y * factor
  };
}

function dot(left: Vector2, right: Vector2): number {
  return (left.x * right.x) + (left.y * right.y);
}

function zeroVector(): Vector2 {
  return { x: 0, y: 0 };
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

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function seededRandom(seed: string): () => number {
  let hash = 2166136261;
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return () => {
    hash += 0x6D2B79F5;
    let next = Math.imul(hash ^ (hash >>> 15), 1 | hash);
    next ^= next + Math.imul(next ^ (next >>> 7), 61 | next);
    return ((next ^ (next >>> 14)) >>> 0) / 4294967296;
  };
}

function circleIntersectsRect(position: Vector2, radius: number, rect: Rect): boolean {
  const nearestX = clamp(position.x, rect.x, rect.x + rect.width);
  const nearestY = clamp(position.y, rect.y, rect.y + rect.height);
  const dx = position.x - nearestX;
  const dy = position.y - nearestY;
  return (dx * dx) + (dy * dy) <= radius * radius;
}

function tankHitsWall(position: Vector2, map: ArenaMap): boolean {
  if (position.x - TANK_RADIUS <= 0 || position.x + TANK_RADIUS >= map.width) {
    return true;
  }

  if (position.y - TANK_RADIUS <= 0 || position.y + TANK_RADIUS >= map.height) {
    return true;
  }

  return map.walls.some((wall) => circleIntersectsRect(position, TANK_RADIUS, wall));
}

function advancePosition(position: Vector2, rotation: number, speed: number): Vector2 {
  return {
    x: position.x + Math.cos(rotation) * speed,
    y: position.y + Math.sin(rotation) * speed
  };
}

function wallDistanceMetrics(tank: TankState, map: ArenaMap): { proximity: number; band: "near" | "medium" | "far" } {
  const distances = [
    tank.position.x,
    tank.position.y,
    map.width - tank.position.x,
    map.height - tank.position.y,
    ...map.walls.map((wall) => {
      const centerX = clamp(tank.position.x, wall.x, wall.x + wall.width);
      const centerY = clamp(tank.position.y, wall.y, wall.y + wall.height);
      return length({ x: tank.position.x - centerX, y: tank.position.y - centerY });
    })
  ];
  const minDistance = Math.min(...distances);

  if (minDistance < 80) {
    return { proximity: 1, band: "near" };
  }

  if (minDistance < 180) {
    return { proximity: 0.5, band: "medium" };
  }

  return { proximity: 0.1, band: "far" };
}

function distanceMetrics(distance: number): { normalized: number; band: "near" | "medium" | "far" } {
  const normalized = clamp(1 - (distance / 450), 0, 1);

  if (distance < 150) {
    return { normalized, band: "near" };
  }

  if (distance < 360) {
    return { normalized, band: "medium" };
  }

  return { normalized, band: "far" };
}

function bulletThreatLevel(tank: TankState, bullets: BulletState[]): number {
  let maxThreat = 0;

  for (const bullet of bullets) {
    if (bullet.ownerTankId === tank.id) {
      continue;
    }

    const futurePosition = {
      x: bullet.position.x + (bullet.velocity.x * 8),
      y: bullet.position.y + (bullet.velocity.y * 8)
    };
    const distance = length({
      x: futurePosition.x - tank.position.x,
      y: futurePosition.y - tank.position.y
    });
    const threat = clamp(1 - (distance / 140), 0, 1);
    maxThreat = Math.max(maxThreat, threat);
  }

  return maxThreat;
}

function healthBand(healthRatio: number): "near" | "medium" | "far" {
  if (healthRatio <= 0.34) {
    return "near";
  }

  if (healthRatio <= 0.67) {
    return "medium";
  }

  return "far";
}

function bearingToTarget(from: Vector2, rotation: number, target: Vector2): number {
  return normalizeAngle(Math.atan2(target.y - from.y, target.x - from.x) - rotation);
}

function reverseBearingToTarget(from: Vector2, rotation: number, target: Vector2): number {
  return normalizeAngle(bearingToTarget(from, rotation, target) + Math.PI);
}

function hasLineOfSight(from: Vector2, to: Vector2, walls: Rect[]): boolean {
  const steps = 30;
  for (let index = 1; index < steps; index += 1) {
    const point = {
      x: from.x + ((to.x - from.x) * index / steps),
      y: from.y + ((to.y - from.y) * index / steps)
    };
    if (walls.some((wall) => circleIntersectsRect(point, 2, wall))) {
      return false;
    }
  }
  return true;
}

const navigationWaypointCache = new Map<string, Vector2[]>();

function clampPointToArena(point: Vector2, map: ArenaMap): Vector2 {
  return {
    x: clamp(point.x, TANK_RADIUS + 4, map.width - TANK_RADIUS - 4),
    y: clamp(point.y, TANK_RADIUS + 4, map.height - TANK_RADIUS - 4)
  };
}

function pointKey(point: Vector2): string {
  return `${Math.round(point.x)}:${Math.round(point.y)}`;
}

function pointIsNavigable(point: Vector2, map: ArenaMap): boolean {
  return !tankHitsWall(point, map);
}

function collectNavigationWaypoints(map: ArenaMap): Vector2[] {
  const cached = navigationWaypointCache.get(map.id);
  if (cached) {
    return cached;
  }

  const clearance = TANK_RADIUS + 36;
  const candidates: Vector2[] = [
    { x: clearance, y: clearance },
    { x: map.width / 2, y: clearance },
    { x: map.width - clearance, y: clearance },
    { x: clearance, y: map.height / 2 },
    { x: map.width / 2, y: map.height / 2 },
    { x: map.width - clearance, y: map.height / 2 },
    { x: clearance, y: map.height - clearance },
    { x: map.width / 2, y: map.height - clearance },
    { x: map.width - clearance, y: map.height - clearance }
  ];

  for (const wall of map.walls) {
    const leftX = wall.x - clearance;
    const rightX = wall.x + wall.width + clearance;
    const topY = wall.y - clearance;
    const bottomY = wall.y + wall.height + clearance;
    const middleX = wall.x + (wall.width / 2);
    const middleY = wall.y + (wall.height / 2);

    candidates.push(
      { x: leftX, y: topY },
      { x: leftX, y: bottomY },
      { x: rightX, y: topY },
      { x: rightX, y: bottomY },
      { x: leftX, y: middleY },
      { x: rightX, y: middleY },
      { x: middleX, y: topY },
      { x: middleX, y: bottomY }
    );
  }

  const uniqueWaypoints = new Map<string, Vector2>();
  for (const candidate of candidates) {
    const point = clampPointToArena(candidate, map);
    if (!pointIsNavigable(point, map)) {
      continue;
    }

    uniqueWaypoints.set(pointKey(point), point);
  }

  const waypoints = [...uniqueWaypoints.values()];
  navigationWaypointCache.set(map.id, waypoints);
  return waypoints;
}

function canDriveDirect(from: Vector2, to: Vector2, map: ArenaMap): boolean {
  const distance = distanceBetween(from, to);
  const steps = Math.max(8, Math.ceil(distance / 22));

  for (let index = 1; index < steps; index += 1) {
    const sample = {
      x: from.x + (((to.x - from.x) * index) / steps),
      y: from.y + (((to.y - from.y) * index) / steps)
    };

    if (tankHitsWall(sample, map)) {
      return false;
    }
  }

  return true;
}

function findNavigationTarget(from: Vector2, target: Vector2, map: ArenaMap): Vector2 {
  const clampedTarget = clampPointToArena(target, map);
  if (canDriveDirect(from, clampedTarget, map)) {
    return clampedTarget;
  }

  const nodes = [from, ...collectNavigationWaypoints(map), clampedTarget];
  const bestCost = new Array<number>(nodes.length).fill(Number.POSITIVE_INFINITY);
  const previous = new Array<number>(nodes.length).fill(-1);
  const visited = new Set<number>();
  const targetIndex = nodes.length - 1;

  bestCost[0] = 0;

  while (visited.size < nodes.length) {
    let currentIndex = -1;
    let currentScore = Number.POSITIVE_INFINITY;

    for (let index = 0; index < nodes.length; index += 1) {
      if (visited.has(index) || !Number.isFinite(bestCost[index])) {
        continue;
      }

      const estimatedScore = bestCost[index] + distanceBetween(nodes[index], clampedTarget);
      if (estimatedScore < currentScore) {
        currentScore = estimatedScore;
        currentIndex = index;
      }
    }

    if (currentIndex === -1) {
      break;
    }

    if (currentIndex === targetIndex) {
      break;
    }

    visited.add(currentIndex);

    for (let index = 1; index < nodes.length; index += 1) {
      if (index === currentIndex || visited.has(index) || !canDriveDirect(nodes[currentIndex], nodes[index], map)) {
        continue;
      }

      const candidateCost = bestCost[currentIndex] + distanceBetween(nodes[currentIndex], nodes[index]);
      if (candidateCost < bestCost[index]) {
        bestCost[index] = candidateCost;
        previous[index] = currentIndex;
      }
    }
  }

  if (previous[targetIndex] === -1) {
    let fallbackIndex = -1;
    let fallbackScore = Number.POSITIVE_INFINITY;

    for (let index = 1; index < nodes.length - 1; index += 1) {
      if (!canDriveDirect(from, nodes[index], map)) {
        continue;
      }

      const score = distanceBetween(nodes[index], clampedTarget);
      if (score < fallbackScore) {
        fallbackScore = score;
        fallbackIndex = index;
      }
    }

    return fallbackIndex === -1 ? clampedTarget : nodes[fallbackIndex];
  }

  const path: number[] = [];
  let currentIndex = targetIndex;
  while (currentIndex !== -1) {
    path.unshift(currentIndex);
    currentIndex = previous[currentIndex];
  }

  return path[1] === undefined ? clampedTarget : nodes[path[1]];
}

function crossSideScore(from: Vector2, target: Vector2, waypoint: Vector2): number {
  const toTarget = subtract(target, from);
  const toWaypoint = subtract(waypoint, from);
  const denominator = Math.max(1, length(toTarget) * length(toWaypoint));
  return clamp(((toTarget.x * toWaypoint.y) - (toTarget.y * toWaypoint.x)) / denominator * 120, -1, 1);
}

function distanceFromWalls(point: Vector2, map: ArenaMap): number {
  const distances = [
    point.x,
    point.y,
    map.width - point.x,
    map.height - point.y,
    ...map.walls.map((wall) => {
      const nearestX = clamp(point.x, wall.x, wall.x + wall.width);
      const nearestY = clamp(point.y, wall.y, wall.y + wall.height);
      return length({ x: point.x - nearestX, y: point.y - nearestY });
    })
  ];

  return Math.min(...distances);
}

function coverScoreAtPoint(point: Vector2, threatAnchor: Vector2, map: ArenaMap): number {
  const hiddenScore = hasLineOfSight(threatAnchor, point, map.walls) ? 0.1 : 0.68;
  const wallSupport = clamp(1 - (distanceFromWalls(point, map) / 220), 0, 1);
  return clamp(hiddenScore + (wallSupport * 0.32), 0, 1);
}

function routeSafetyBetween(from: Vector2, to: Vector2, threatAnchor: Vector2, map: ArenaMap): number {
  const distance = distanceBetween(from, to);
  const steps = Math.max(4, Math.ceil(distance / 80));
  let hiddenSamples = 0;

  for (let index = 1; index <= steps; index += 1) {
    const sample = {
      x: from.x + (((to.x - from.x) * index) / steps),
      y: from.y + (((to.y - from.y) * index) / steps)
    };

    if (!hasLineOfSight(threatAnchor, sample, map.walls)) {
      hiddenSamples += 1;
    }
  }

  return hiddenSamples / steps;
}

function chooseBestWaypoint(map: ArenaMap, scorer: (point: Vector2) => number): Vector2 | null {
  let bestPoint: Vector2 | null = null;
  let bestScore = Number.NEGATIVE_INFINITY;

  for (const point of collectNavigationWaypoints(map)) {
    const score = scorer(point);
    if (score > bestScore) {
      bestScore = score;
      bestPoint = point;
    }
  }

  return bestPoint;
}

function selectRoamTarget(tank: TankState, searchPosition: Vector2, threatAnchor: Vector2, map: ArenaMap): Vector2 {
  const currentTarget = tank.aiMemory.roamTarget;
  if (currentTarget && distanceBetween(tank.position, currentTarget) > 44 && pointIsNavigable(currentTarget, map)) {
    return currentTarget;
  }

  const openingChoice = tank.aiMemory.openingChoice;
  const sideBias = openingChoice === "wideFlankLeft"
    ? -1
    : openingChoice === "wideFlankRight"
      ? 1
      : 0;
  const preferCenter = openingChoice === "centerProbe";
  const preferCover = openingChoice === "holdAngle";
  const centerPoint = { x: map.width / 2, y: map.height / 2 };

  const nextTarget = chooseBestWaypoint(map, (point) => {
    const tankDistance = distanceBetween(tank.position, point);
    if (tankDistance < 80) {
      return Number.NEGATIVE_INFINITY;
    }

    const enemyDistance = distanceBetween(searchPosition, point);
    const sideScore = sideBias === 0 ? 0 : (crossSideScore(tank.position, searchPosition, point) * sideBias * 18);
    const routeScore = routeSafetyBetween(tank.position, point, threatAnchor, map) * 18;
    const coverScore = coverScoreAtPoint(point, threatAnchor, map) * (preferCover ? 24 : 9);
    const centerScore = preferCenter ? Math.max(0, 18 - (distanceBetween(point, centerPoint) / 28)) : 0;

    return (16 - Math.abs(tankDistance - 220) / 18)
      + (Math.min(enemyDistance, 360) / 60)
      + sideScore
      + routeScore
      + coverScore
      + centerScore;
  }) ?? clampPointToArena(searchPosition, map);

  tank.aiMemory.roamTarget = nextTarget;
  return nextTarget;
}

function findCoverTarget(tank: TankState, searchPosition: Vector2, threatAnchor: Vector2, map: ArenaMap): Vector2 {
  const currentCover = coverScoreAtPoint(tank.position, threatAnchor, map);
  if (currentCover > 0.85 && distanceBetween(tank.position, searchPosition) > 110) {
    return tank.position;
  }

  return chooseBestWaypoint(map, (point) => {
    const coverScore = coverScoreAtPoint(point, threatAnchor, map);
    if (coverScore < 0.46) {
      return Number.NEGATIVE_INFINITY;
    }

    const tankDistance = distanceBetween(tank.position, point);
    const peekAccess = hasLineOfSight(point, searchPosition, map.walls) ? 7 : 0;
    return (coverScore * 34)
      + (routeSafetyBetween(tank.position, point, threatAnchor, map) * 18)
      + peekAccess
      - (tankDistance / 16);
  }) ?? tank.position;
}

function findPeekTarget(
  tank: TankState,
  searchPosition: Vector2,
  threatAnchor: Vector2,
  coverTarget: Vector2,
  map: ArenaMap
): Vector2 {
  return chooseBestWaypoint(map, (point) => {
    if (!hasLineOfSight(point, searchPosition, map.walls)) {
      return Number.NEGATIVE_INFINITY;
    }

    const coverDistance = distanceBetween(coverTarget, point);
    if (coverDistance > 240) {
      return Number.NEGATIVE_INFINITY;
    }

    const targetDistance = distanceBetween(searchPosition, point);
    return 30
      - (coverDistance / 16)
      - (Math.abs(targetDistance - 220) / 28)
      + (routeSafetyBetween(tank.position, point, threatAnchor, map) * 8);
  }) ?? findNavigationTarget(tank.position, searchPosition, map);
}

function findFlankTarget(
  tank: TankState,
  searchPosition: Vector2,
  threatAnchor: Vector2,
  direction: -1 | 1,
  map: ArenaMap
): Vector2 {
  return chooseBestWaypoint(map, (point) => {
    const sideScore = crossSideScore(tank.position, searchPosition, point) * direction;
    const targetDistance = distanceBetween(searchPosition, point);
    const hiddenBonus = hasLineOfSight(threatAnchor, point, map.walls) ? 0 : 10;
    return (sideScore * 26)
      + (routeSafetyBetween(tank.position, point, threatAnchor, map) * 20)
      + hiddenBonus
      + (12 - Math.abs(targetDistance - 180) / 24);
  }) ?? findNavigationTarget(tank.position, searchPosition, map);
}

function findRetreatTarget(tank: TankState, threatAnchor: Vector2, coverTarget: Vector2, map: ArenaMap): Vector2 {
  if (distanceBetween(tank.position, coverTarget) > 24) {
    return coverTarget;
  }

  const retreatVector = subtract(tank.position, threatAnchor);
  const retreatDistance = length(retreatVector);
  const fallbackDirection = retreatDistance === 0
    ? { x: Math.cos(tank.rotation + Math.PI), y: Math.sin(tank.rotation + Math.PI) }
    : scale(retreatVector, 1 / retreatDistance);
  const retreatPoint = clampPointToArena(add(tank.position, scale(fallbackDirection, 180)), map);

  return findNavigationTarget(tank.position, retreatPoint, map);
}

function findReverseEscapeTarget(
  tank: TankState,
  threatAnchor: Vector2,
  retreatTarget: Vector2,
  coverTarget: Vector2,
  map: ArenaMap
): Vector2 {
  const backwardProbe = clampPointToArena(
    add(tank.position, scale({
      x: Math.cos(tank.rotation + Math.PI),
      y: Math.sin(tank.rotation + Math.PI)
    }, 180)),
    map
  );

  const scoredWaypoint = chooseBestWaypoint(map, (point) => {
    const candidate = findNavigationTarget(tank.position, point, map);
    const candidateDistance = distanceBetween(tank.position, candidate);
    if (candidateDistance < 32) {
      return Number.NEGATIVE_INFINITY;
    }

    const reverseAlignment = clamp(1 - (Math.abs(reverseBearingToTarget(tank.position, tank.rotation, candidate)) / Math.PI), 0, 1);
    const coverScore = coverScoreAtPoint(candidate, threatAnchor, map);
    const routeScore = routeSafetyBetween(tank.position, candidate, threatAnchor, map);
    const threatDistanceScore = clamp(distanceBetween(candidate, threatAnchor) / 320, 0, 1);
    const travelScore = clamp(candidateDistance / 180, 0, 1);

    return (reverseAlignment * 26)
      + (routeScore * 18)
      + (coverScore * 14)
      + (threatDistanceScore * 8)
      + (travelScore * 6);
  });

  const rawCandidates = [
    retreatTarget,
    coverTarget,
    backwardProbe,
    scoredWaypoint ?? retreatTarget
  ];

  const uniqueCandidates = new Map<string, Vector2>();
  for (const candidate of rawCandidates) {
    const target = findNavigationTarget(tank.position, candidate, map);
    uniqueCandidates.set(pointKey(target), target);
  }

  let bestTarget = retreatTarget;
  let bestScore = Number.NEGATIVE_INFINITY;

  for (const candidate of uniqueCandidates.values()) {
    const candidateDistance = distanceBetween(tank.position, candidate);
    const reverseAlignment = clamp(1 - (Math.abs(reverseBearingToTarget(tank.position, tank.rotation, candidate)) / Math.PI), 0, 1);
    const coverScore = coverScoreAtPoint(candidate, threatAnchor, map);
    const routeScore = routeSafetyBetween(tank.position, candidate, threatAnchor, map);
    const travelScore = clamp(candidateDistance / 180, 0, 1);

    const score = (reverseAlignment * 24)
      + (routeScore * 18)
      + (coverScore * 12)
      + (travelScore * 8);

    if (score > bestScore) {
      bestScore = score;
      bestTarget = candidate;
    }
  }

  return bestTarget;
}

function reverseClearanceScore(tank: TankState, map: ArenaMap): number {
  const maxDistance = 180;
  const sampleStep = 18;
  const backwardRotation = normalizeAngle(tank.rotation + Math.PI);
  let clearance = maxDistance;

  for (let distance = sampleStep; distance <= maxDistance; distance += sampleStep) {
    const sample = advancePosition(tank.position, backwardRotation, distance);
    if (tankHitsWall(sample, map)) {
      clearance = distance - sampleStep;
      break;
    }
  }

  return clamp(clearance / maxDistance, 0, 1);
}

function findBaitTarget(
  tank: TankState,
  coverTarget: Vector2,
  peekTarget: Vector2
): Vector2 {
  return tank.aiMemory.activeTacticTicks % 24 < 12 ? peekTarget : coverTarget;
}

type ArenaBoundary = "left" | "right" | "top" | "bottom";

function reflectAcrossBoundary(point: Vector2, boundary: ArenaBoundary, map: ArenaMap): Vector2 {
  switch (boundary) {
    case "left":
      return { x: -point.x, y: point.y };
    case "right":
      return { x: (map.width * 2) - point.x, y: point.y };
    case "top":
      return { x: point.x, y: -point.y };
    case "bottom":
      return { x: point.x, y: (map.height * 2) - point.y };
    default:
      return point;
  }
}

function boundaryBouncePoint(from: Vector2, reflectedTarget: Vector2, boundary: ArenaBoundary, map: ArenaMap): Vector2 | null {
  if (boundary === "left" || boundary === "right") {
    const boundaryX = boundary === "left" ? 0 : map.width;
    const denominator = reflectedTarget.x - from.x;
    if (denominator === 0) {
      return null;
    }

    const progress = (boundaryX - from.x) / denominator;
    if (progress <= 0 || progress >= 1) {
      return null;
    }

    const y = from.y + ((reflectedTarget.y - from.y) * progress);
    if (y <= 0 || y >= map.height) {
      return null;
    }

    return { x: boundaryX, y };
  }

  const boundaryY = boundary === "top" ? 0 : map.height;
  const denominator = reflectedTarget.y - from.y;
  if (denominator === 0) {
    return null;
  }

  const progress = (boundaryY - from.y) / denominator;
  if (progress <= 0 || progress >= 1) {
    return null;
  }

  const x = from.x + ((reflectedTarget.x - from.x) * progress);
  if (x <= 0 || x >= map.width) {
    return null;
  }

  return { x, y: boundaryY };
}

function findBoundaryBankShot(from: Vector2, target: Vector2, map: ArenaMap): { opportunity: number; bearing: number } {
  const boundaries: ArenaBoundary[] = ["left", "right", "top", "bottom"];
  let bestOpportunity = 0;
  let bestBearing = 0;

  for (const boundary of boundaries) {
    const reflectedTarget = reflectAcrossBoundary(target, boundary, map);
    const bouncePoint = boundaryBouncePoint(from, reflectedTarget, boundary, map);
    if (!bouncePoint) {
      continue;
    }

    if (!hasLineOfSight(from, bouncePoint, map.walls) || !hasLineOfSight(bouncePoint, target, map.walls)) {
      continue;
    }

    const bearing = bearingToTarget(from, 0, bouncePoint);
    const opportunity = clamp(1 - (Math.abs(bearing) / (Math.PI / 1.5)), 0, 1);
    if (opportunity > bestOpportunity) {
      bestOpportunity = opportunity;
      bestBearing = bouncePoint.y === 0 || bouncePoint.y === map.height
        ? Math.atan2(bouncePoint.y - from.y, bouncePoint.x - from.x)
        : Math.atan2(bouncePoint.y - from.y, bouncePoint.x - from.x);
    }
  }

  return {
    opportunity: bestOpportunity,
    bearing: bestBearing
  };
}

function computeSensors(
  tank: TankState,
  enemy: TankState,
  map: ArenaMap,
  bullets: BulletState[]
): BotSensors {
  const dx = enemy.position.x - tank.position.x;
  const dy = enemy.position.y - tank.position.y;
  const bearing = normalizeAngle(Math.atan2(dy, dx) - tank.rotation);
  const distance = length({ x: dx, y: dy });
  const distanceMetric = distanceMetrics(distance);
  const wallMetric = wallDistanceMetrics(tank, map);
  const threatLevel = bulletThreatLevel(tank, bullets);
  const healthRatio = tank.health / TANK_MAX_HEALTH;
  const enemyVisible = hasLineOfSight(tank.position, enemy.position, map.walls);
  const enemyVelocity = {
    x: enemy.position.x - enemy.lastPosition.x,
    y: enemy.position.y - enemy.lastPosition.y
  };
  const memory = tank.aiMemory;

  if (enemyVisible) {
    memory.lastSeenEnemyPosition = { ...enemy.position };
    memory.lastSeenEnemyVelocity = { ...enemyVelocity };
    memory.ticksSinceEnemySeen = 0;
  } else {
    memory.ticksSinceEnemySeen += 1;
  }

  const searchPosition = memory.lastSeenEnemyPosition
    ? {
      x: memory.lastSeenEnemyPosition.x + (memory.lastSeenEnemyVelocity.x * Math.min(memory.ticksSinceEnemySeen, 18)),
      y: memory.lastSeenEnemyPosition.y + (memory.lastSeenEnemyVelocity.y * Math.min(memory.ticksSinceEnemySeen, 18))
    }
    : enemy.position;
  const threatAnchor = enemyVisible ? enemy.position : searchPosition;
  const navigationTarget = findNavigationTarget(tank.position, searchPosition, map);
  const roamTarget = selectRoamTarget(tank, searchPosition, threatAnchor, map);
  const coverTarget = findCoverTarget(tank, searchPosition, threatAnchor, map);
  const peekTarget = findPeekTarget(tank, searchPosition, threatAnchor, coverTarget, map);
  const flankLeftTarget = findFlankTarget(tank, searchPosition, threatAnchor, -1, map);
  const flankRightTarget = findFlankTarget(tank, searchPosition, threatAnchor, 1, map);
  const retreatTarget = findRetreatTarget(tank, threatAnchor, coverTarget, map);
  const reverseEscapeTarget = findReverseEscapeTarget(tank, threatAnchor, retreatTarget, coverTarget, map);
  const baitTarget = findBaitTarget(tank, coverTarget, peekTarget);
  const bankShot = findBoundaryBankShot(tank.position, searchPosition, map);
  const interceptTicks = clamp(distance / tank.resolvedStats.bulletSpeed, 0, 18);
  const interceptPosition = enemyVisible
    ? {
      x: enemy.position.x + (enemyVelocity.x * interceptTicks),
      y: enemy.position.y + (enemyVelocity.y * interceptTicks)
    }
    : navigationTarget;
  const guidanceBearing = enemyVisible
    ? bearing
    : bearingToTarget(tank.position, tank.rotation, navigationTarget);
  const improvedContact = memory.previousEnemyDistance === null
    || distance < memory.previousEnemyDistance - 6
    || Math.abs(guidanceBearing) < Math.PI / 6;

  if (distance > 140 && !improvedContact) {
    memory.stalledTicks += 1;
  } else {
    memory.stalledTicks = Math.max(memory.stalledTicks - 2, 0);
  }

  memory.previousEnemyDistance = distance;

  const coverScore = coverScoreAtPoint(tank.position, threatAnchor, map);
  const routeSafety = routeSafetyBetween(tank.position, navigationTarget, threatAnchor, map);
  const reverseRouteSafety = routeSafetyBetween(tank.position, reverseEscapeTarget, threatAnchor, map);
  const leftFlankOpportunity = routeSafetyBetween(tank.position, flankLeftTarget, threatAnchor, map);
  const rightFlankOpportunity = routeSafetyBetween(tank.position, flankRightTarget, threatAnchor, map);
  const flankOpportunity = Math.max(leftFlankOpportunity, rightFlankOpportunity);
  const reverseEscapeBearing = reverseBearingToTarget(tank.position, tank.rotation, reverseEscapeTarget);
  const reverseEscapeAlignment = clamp(1 - (Math.abs(reverseEscapeBearing) / Math.PI), 0, 1);
  const reverseEscapeSafety = clamp(
    (reverseClearanceScore(tank, map) * 0.45)
    + (reverseRouteSafety * 0.3)
    + (reverseEscapeAlignment * 0.15)
    + (coverScoreAtPoint(reverseEscapeTarget, threatAnchor, map) * 0.1),
    0,
    1
  );
  const exposureScore = clamp(
    (enemyVisible ? 0.72 : 0.2)
    + ((1 - coverScore) * 0.28)
    + (wallMetric.proximity * 0.08),
    0,
    1
  );

  return {
    enemyVisible,
    enemyBearing: bearing,
    enemyAlignment: clamp(1 - (Math.abs(bearing) / Math.PI), 0, 1),
    enemyDistance: distanceMetric.normalized,
    enemyDistanceBand: distanceMetric.band,
    wallProximity: wallMetric.proximity,
    wallDistanceBand: wallMetric.band,
    bulletThreat: threatLevel > 0.2,
    bulletThreatLevel: threatLevel,
    interceptBearing: bearingToTarget(tank.position, tank.rotation, interceptPosition),
    reverseEscapeBearing,
    reverseEscapeSafety,
    searchBearing: bearingToTarget(tank.position, tank.rotation, navigationTarget),
    hasRecentEnemyContact: memory.ticksSinceEnemySeen < 18,
    stalled: memory.stalledTicks >= 12,
    ticksSinceEnemySeen: memory.ticksSinceEnemySeen,
    searchTurnDirection: memory.searchTurnDirection,
    coverScore,
    exposureScore,
    routeSafety,
    flankOpportunity,
    bankShotOpportunity: bankShot.opportunity,
    roamBearing: bearingToTarget(tank.position, tank.rotation, findNavigationTarget(tank.position, roamTarget, map)),
    investigateBearing: bearingToTarget(tank.position, tank.rotation, navigationTarget),
    coverBearing: bearingToTarget(tank.position, tank.rotation, findNavigationTarget(tank.position, coverTarget, map)),
    peekBearing: bearingToTarget(tank.position, tank.rotation, findNavigationTarget(tank.position, peekTarget, map)),
    flankLeftBearing: bearingToTarget(tank.position, tank.rotation, findNavigationTarget(tank.position, flankLeftTarget, map)),
    flankRightBearing: bearingToTarget(tank.position, tank.rotation, findNavigationTarget(tank.position, flankRightTarget, map)),
    retreatBearing: bearingToTarget(tank.position, tank.rotation, retreatTarget),
    baitBearing: bearingToTarget(tank.position, tank.rotation, findNavigationTarget(tank.position, baitTarget, map)),
    bankShotBearing: normalizeAngle(bankShot.bearing - tank.rotation),
    cooldownReady: tank.cooldownTicks === 0,
    stuckTimer: tank.stuckTimer,
    healthRatio,
    healthBand: healthBand(healthRatio)
  };
}

function createBullet(tank: TankState, tick: number): BulletState {
  const direction = {
    x: Math.cos(tank.rotation),
    y: Math.sin(tank.rotation)
  };
  const bulletSpeed = tank.resolvedStats.bulletSpeed;

  return {
    id: `${tank.id}-bullet-${tick}`,
    ownerTankId: tank.id,
    position: {
      x: tank.position.x + direction.x * (TANK_RADIUS + BULLET_RADIUS + 2),
      y: tank.position.y + direction.y * (TANK_RADIUS + BULLET_RADIUS + 2)
    },
    velocity: {
      x: direction.x * bulletSpeed,
      y: direction.y * bulletSpeed
    },
    remainingBounces: MAX_BOUNCES,
    ageTicks: 0
  };
}

function bulletCollisionPoint(
  fromA: Vector2,
  toA: Vector2,
  fromB: Vector2,
  toB: Vector2
): Vector2 | null {
  const relativeStart = subtract(fromA, fromB);
  const relativeVelocity = subtract(subtract(toA, fromA), subtract(toB, fromB));
  const collisionDistance = BULLET_RADIUS * 2;
  const velocityMagnitude = dot(relativeVelocity, relativeVelocity);

  if (velocityMagnitude === 0) {
    return distanceBetween(fromA, fromB) <= collisionDistance ? midpoint(fromA, fromB) : null;
  }

  const contactTime = clamp(-dot(relativeStart, relativeVelocity) / velocityMagnitude, 0, 1);
  const pointA = add(fromA, scale(subtract(toA, fromA), contactTime));
  const pointB = add(fromB, scale(subtract(toB, fromB), contactTime));

  return distanceBetween(pointA, pointB) <= collisionDistance
    ? midpoint(pointA, pointB)
    : null;
}

function createImpactEffect(tick: number, leftBulletId: string, rightBulletId: string, position: Vector2): ImpactEffect {
  return {
    id: `impact-${tick}-${leftBulletId}-${rightBulletId}`,
    kind: "bulletClash",
    position,
    ageTicks: 0,
    durationTicks: 8
  };
}

function createTankHitEffect(tick: number, tank: TankState): ImpactEffect {
  return {
    id: `tank-hit-${tick}-${tank.id}`,
    kind: "tankHit",
    tankId: tank.id,
    position: { ...tank.position },
    remainingHealth: tank.health,
    ageTicks: 0,
    durationTicks: tank.health <= 0 ? 14 : 10
  };
}

function moveTank(tank: TankState, map: ArenaMap): boolean {
  let moved = false;

  if (tank.intent.steer !== 0) {
    tank.rotation = normalizeAngle(tank.rotation + (tank.resolvedStats.rotationSpeed * tank.intent.steer));
  }

  if (tank.intent.throttle !== 0) {
    const speed = tank.intent.throttle > 0
      ? tank.resolvedStats.forwardSpeed
      : -tank.resolvedStats.reverseSpeed;
    const nextPosition = advancePosition(tank.position, tank.rotation, speed);
    if (!tankHitsWall(nextPosition, map)) {
      tank.position = nextPosition;
      moved = true;
    }
  }

  if (tank.cooldownTicks > 0) {
    tank.cooldownTicks -= 1;
  }

  return moved;
}

function snapshotState(tick: number, tanks: TankState[], bullets: BulletState[], effects: ImpactEffect[]): MatchSnapshot {
  return {
    tick,
    tanks: tanks.map((tank) => ({
      id: tank.id,
      name: tank.name,
      position: { ...tank.position },
      rotation: tank.rotation,
      health: tank.health,
      cooldownTicks: tank.cooldownTicks
    })),
    bullets: bullets.map((bullet) => ({
      ...bullet,
      position: { ...bullet.position },
      velocity: { ...bullet.velocity }
    })),
    effects: effects.map((effect) => ({
      ...effect,
      position: { ...effect.position }
    }))
  };
}

function bounceBullet(bullet: BulletState, map: ArenaMap): boolean {
  let bounced = false;
  const nextPosition = {
    x: bullet.position.x + bullet.velocity.x,
    y: bullet.position.y + bullet.velocity.y
  };

  if (nextPosition.x - BULLET_RADIUS <= 0 || nextPosition.x + BULLET_RADIUS >= map.width) {
    bullet.velocity.x *= -1;
    bounced = true;
  }

  if (nextPosition.y - BULLET_RADIUS <= 0 || nextPosition.y + BULLET_RADIUS >= map.height) {
    bullet.velocity.y *= -1;
    bounced = true;
  }

  for (const wall of map.walls) {
    if (!circleIntersectsRect(nextPosition, BULLET_RADIUS, wall)) {
      continue;
    }

    const left = Math.abs(nextPosition.x - wall.x);
    const right = Math.abs((wall.x + wall.width) - nextPosition.x);
    const top = Math.abs(nextPosition.y - wall.y);
    const bottom = Math.abs((wall.y + wall.height) - nextPosition.y);
    const minEdge = Math.min(left, right, top, bottom);

    if (minEdge === left || minEdge === right) {
      bullet.velocity.x *= -1;
    } else {
      bullet.velocity.y *= -1;
    }

    bounced = true;
    break;
  }

  if (bounced) {
    bullet.remainingBounces -= 1;
  }

  bullet.position = {
    x: bullet.position.x + bullet.velocity.x,
    y: bullet.position.y + bullet.velocity.y
  };

  return bounced;
}

function tankHitByBullet(tank: TankState, bullet: BulletState): boolean {
  return length({
    x: bullet.position.x - tank.position.x,
    y: bullet.position.y - tank.position.y
  }) <= TANK_RADIUS + BULLET_RADIUS;
}

function buildResult(session: BattleSession, reason: MatchReason, winnerTankId: string | null): MatchResult {
  const finalState = snapshotState(session.tick, session.tanks, session.bullets, session.effects);
  if (session.replay[session.replay.length - 1]?.tick !== finalState.tick) {
    session.replay.push(finalState);
  }

  return {
    mapId: session.map.id,
    totalTicks: session.tick,
    winnerTankId,
    reason,
    replay: session.replay,
    finalState
  };
}

function resolveManualIntent(tank: TankState, tick: number): TankIntent {
  return tank.manualScript?.[tick] ?? {
    throttle: 0,
    steer: 0,
    fire: false
  };
}

function defaultIntent(): TankIntent {
  return {
    throttle: 0,
    steer: 0,
    fire: false
  };
}

function emptyTacticCooldowns() {
  return {
    roam: 0,
    investigateLastSeen: 0,
    takeCover: 0,
    peekShot: 0,
    flank: 0,
    pressure: 0,
    retreat: 0,
    baitShot: 0
  };
}

export function createBattleSession(input: EngineInput): BattleSession {
  return {
    map: input.map,
    tanks: input.tanks.map((tank) => ({
      ...tank,
      baseStats: { ...tank.baseStats },
      resolvedStats: { ...tank.resolvedStats },
      position: { ...tank.position },
      lastPosition: { ...tank.lastPosition },
      intent: tank.intent ?? defaultIntent(),
      decisionTicksRemaining: tank.decisionTicksRemaining ?? 0,
      stuckTimer: tank.stuckTimer ?? 0,
      aiMemory: {
        ...tank.aiMemory,
        lastSeenEnemyPosition: tank.aiMemory.lastSeenEnemyPosition ? { ...tank.aiMemory.lastSeenEnemyPosition } : null,
        lastSeenEnemyVelocity: { ...tank.aiMemory.lastSeenEnemyVelocity },
        roamTarget: tank.aiMemory.roamTarget ? { ...tank.aiMemory.roamTarget } : null,
        reverseBurstTicksRemaining: tank.aiMemory.reverseBurstTicksRemaining ?? 0,
        reverseHoldTicksRemaining: tank.aiMemory.reverseHoldTicksRemaining ?? 0,
        reverseEscapeUnsafeTicks: tank.aiMemory.reverseEscapeUnsafeTicks ?? 0,
        tacticCooldowns: { ...tank.aiMemory.tacticCooldowns }
      },
      manualScript: tank.manualScript ? [...tank.manualScript] : undefined
    })) as [TankState, TankState],
    bullets: [],
    effects: [],
    replay: [],
    tick: 0,
    maxTicks: MAX_TICKS,
    winnerTankId: null,
    reason: null,
    completed: false,
    rng: seededRandom(input.seed)
  };
}

export function getBattleSnapshot(session: BattleSession): MatchSnapshot {
  return snapshotState(session.tick, session.tanks, session.bullets, session.effects);
}

export function stepBattleSession(session: BattleSession): MatchSnapshot {
  if (session.completed) {
    return session.result?.finalState ?? getBattleSnapshot(session);
  }

  session.tick += 1;
  session.effects = session.effects
    .map((effect) => ({
      ...effect,
      ageTicks: effect.ageTicks + 1
    }))
    .filter((effect) => effect.ageTicks < effect.durationTicks);

  for (const tank of session.tanks) {
    if (tank.health <= 0) {
      continue;
    }

    if (tank.aiMemory.activeTacticId) {
      tank.aiMemory.activeTacticTicks += 1;
    }

    if (tank.aiMemory.openingTicksRemaining > 0) {
      tank.aiMemory.openingTicksRemaining -= 1;
    }

    tank.aiMemory.ticksSinceLastHit = Math.min(tank.aiMemory.ticksSinceLastHit + 1, 9999);

    for (const tacticName of Object.keys(tank.aiMemory.tacticCooldowns) as Array<keyof typeof tank.aiMemory.tacticCooldowns>) {
      if (tank.aiMemory.tacticCooldowns[tacticName] > 0) {
        tank.aiMemory.tacticCooldowns[tacticName] -= 1;
      }
    }

    const previousPosition = { ...tank.position };

    if (tank.stuckTimer > 8 || tank.aiMemory.stalledTicks > 24) {
      tank.aiMemory.searchTurnDirection = tank.aiMemory.searchTurnDirection === 1 ? -1 : 1;
      tank.aiMemory.stalledTicks = Math.max(tank.aiMemory.stalledTicks - 8, 0);
      tank.aiMemory.roamTarget = null;
      tank.decisionTicksRemaining = 0;
    }

    if (tank.isManual) {
      tank.intent = resolveManualIntent(tank, session.tick - 1);
    } else if (tank.bot) {
      const activeReverseBurstGoal = tank.bot.goals.find((goal) => (
        goal.id === tank.aiMemory.activeGoalId
        && goal.movementProfile.engagementDrive === "reverseBurst"
      ));
      const needsDecision = tank.decisionTicksRemaining <= 0
        || tank.aiMemory.ticksSinceLastHit === 0
        || tank.stuckTimer >= 8
        || tank.aiMemory.stalledTicks > 24
        || Boolean(activeReverseBurstGoal)
        || tank.aiMemory.reverseBurstTicksRemaining > 0
        || tank.aiMemory.reverseHoldTicksRemaining > 0;

      if (needsDecision) {
        const enemy = session.tanks.find((candidate) => candidate.id !== tank.id)!;
        const sensors = computeSensors(tank, enemy, session.map, session.bullets);
        const forceReplan = Boolean(tank.bot.tactics || tank.bot.openings?.length) && (
          ((tank.bot.commitment?.replanOnSightChange ?? true) && sensors.enemyVisible !== tank.aiMemory.lastEnemyVisible)
          || ((tank.bot.commitment?.replanOnHit ?? true) && tank.aiMemory.ticksSinceLastHit === 0)
          || ((tank.bot.commitment?.replanOnStuck ?? true) && (tank.stuckTimer >= 8 || sensors.stalled))
        );

        if (forceReplan) {
          tank.decisionTicksRemaining = 0;
        }

        const choice = chooseIntent(tank.bot, sensors, tank.aiMemory, session.rng);
        tank.intent = choice.intent;
        if (tank.aiMemory.activeGoalId === choice.goalId) {
          tank.aiMemory.activeGoalTicks += 1;
        } else {
          tank.aiMemory.activeGoalId = choice.goalId;
          tank.aiMemory.activeGoalTicks = 0;
        }
        tank.decisionTicksRemaining = sensors.enemyVisible ? 3 : 4;
      } else {
        tank.decisionTicksRemaining -= 1;
        tank.aiMemory.activeGoalTicks += 1;
      }
    } else {
      tank.intent = defaultIntent();
    }

    const moved = moveTank(tank, session.map);
    tank.stuckTimer = moved
      ? 0
      : (previousPosition.x === tank.position.x && previousPosition.y === tank.position.y ? tank.stuckTimer + 1 : 0);

    if (tank.intent.fire && tank.cooldownTicks === 0) {
      session.bullets.push(createBullet(tank, session.tick));
      tank.cooldownTicks = tank.resolvedStats.shotCooldownTicks;
    }
  }

  const previousBulletPositions = new Map<string, Vector2>();
  for (const bullet of session.bullets) {
    previousBulletPositions.set(bullet.id, { ...bullet.position });
  }

  for (let index = session.bullets.length - 1; index >= 0; index -= 1) {
    const bullet = session.bullets[index];
    bullet.ageTicks += 1;

    const bounced = bounceBullet(bullet, session.map);
    if (bounced && bullet.remainingBounces < 0) {
      session.bullets.splice(index, 1);
      continue;
    }

    if (bullet.ageTicks > BULLET_LIFETIME_TICKS) {
      session.bullets.splice(index, 1);
      continue;
    }
  }

  const destroyedBulletIds = new Set<string>();

  for (let leftIndex = 0; leftIndex < session.bullets.length; leftIndex += 1) {
    const leftBullet = session.bullets[leftIndex];
    if (destroyedBulletIds.has(leftBullet.id)) {
      continue;
    }

    for (let rightIndex = leftIndex + 1; rightIndex < session.bullets.length; rightIndex += 1) {
      const rightBullet = session.bullets[rightIndex];
      if (destroyedBulletIds.has(rightBullet.id)) {
        continue;
      }

      const leftFrom = previousBulletPositions.get(leftBullet.id) ?? leftBullet.position;
      const rightFrom = previousBulletPositions.get(rightBullet.id) ?? rightBullet.position;
      const impactPoint = bulletCollisionPoint(leftFrom, leftBullet.position, rightFrom, rightBullet.position);

      if (!impactPoint) {
        continue;
      }

      destroyedBulletIds.add(leftBullet.id);
      destroyedBulletIds.add(rightBullet.id);
      session.effects.push(createImpactEffect(session.tick, leftBullet.id, rightBullet.id, impactPoint));
      break;
    }
  }

  if (destroyedBulletIds.size > 0) {
    session.bullets = session.bullets.filter((bullet) => !destroyedBulletIds.has(bullet.id));
  }

  for (let index = session.bullets.length - 1; index >= 0; index -= 1) {
    const bullet = session.bullets[index];
    const hitTank = session.tanks.find((tank) => tank.id !== bullet.ownerTankId && tank.health > 0 && tankHitByBullet(tank, bullet));
    if (hitTank) {
      hitTank.health -= 1;
      if (hitTank.health <= 0) {
        hitTank.eliminatedAtTick = session.tick;
      }
      hitTank.aiMemory.ticksSinceLastHit = 0;
      hitTank.aiMemory.searchTurnDirection = hitTank.aiMemory.searchTurnDirection === 1 ? -1 : 1;
      hitTank.aiMemory.roamTarget = null;
      hitTank.aiMemory.stalledTicks = 0;
      hitTank.decisionTicksRemaining = 0;
      session.effects.push(createTankHitEffect(session.tick, hitTank));
      session.bullets.splice(index, 1);
    }
  }

  for (const tank of session.tanks) {
    tank.lastPosition = { ...tank.position };
  }

  const snapshot = getBattleSnapshot(session);
  session.replay.push(snapshot);

  const activeTanks = session.tanks.filter((tank) => tank.health > 0);
  if (activeTanks.length <= 1) {
    session.completed = true;
    session.winnerTankId = activeTanks[0]?.id ?? null;
    session.reason = activeTanks.length === 1 ? "elimination" : "draw";
    session.result = buildResult(session, session.reason, session.winnerTankId);
    return snapshot;
  }

  if (session.tick >= session.maxTicks) {
    const [left, right] = session.tanks;
    let winnerTankId: string | null = null;

    if (left.health !== right.health) {
      winnerTankId = left.health > right.health ? left.id : right.id;
    }

    session.completed = true;
    session.winnerTankId = winnerTankId;
    session.reason = winnerTankId ? "timeout" : "draw";
    session.result = buildResult(session, session.reason, session.winnerTankId);
  }

  return snapshot;
}

export function finishBattleSession(session: BattleSession): MatchResult {
  while (!session.completed) {
    stepBattleSession(session);
  }

  return session.result!;
}

export function simulateMatch(input: EngineInput): MatchResult {
  const session = createBattleSession(input);
  session.replay.push(getBattleSnapshot(session));
  return finishBattleSession(session);
}

export function createInitialTankState(params: {
  id: string;
  name: string;
  position: Vector2;
  rotation: number;
  isManual: boolean;
  stats?: BotStats;
  bot?: TankState["bot"];
  manualScript?: TankState["manualScript"];
}): TankState {
  const initialTurnDirection = Array.from(params.id).reduce((sum, character) => sum + character.charCodeAt(0), 0) % 2 === 0 ? -1 : 1;
  const baseStats = { ...resolveBaseStats(params.stats ?? params.bot?.stats) };

  return {
    id: params.id,
    name: params.name,
    position: params.position,
    lastPosition: { ...params.position },
    rotation: params.rotation,
    baseStats,
    resolvedStats: resolveTankStats(baseStats),
    health: TANK_MAX_HEALTH,
    cooldownTicks: 0,
    intent: defaultIntent(),
    decisionTicksRemaining: 0,
    stuckTimer: 0,
    aiMemory: {
      activeGoalId: null,
      activeGoalTicks: 0,
      activeTacticId: null,
      activeTacticTicks: 0,
      lastCompletedTacticId: null,
      stalledTicks: 0,
      previousEnemyDistance: null,
      lastSeenEnemyPosition: null,
      lastSeenEnemyVelocity: zeroVector(),
      ticksSinceEnemySeen: 999,
      searchTurnDirection: initialTurnDirection,
      preferredFlankDirection: initialTurnDirection,
      openingChoice: null,
      openingTicksRemaining: 0,
      roamTarget: null,
      ticksSinceLastHit: 999,
      lastEnemyVisible: false,
      reverseBurstTicksRemaining: 0,
      reverseHoldTicksRemaining: 0,
      reverseEscapeUnsafeTicks: 0,
      tacticCooldowns: emptyTacticCooldowns()
    },
    isManual: params.isManual,
    bot: params.bot,
    manualScript: params.manualScript
  };
}
