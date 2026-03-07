import {
  BULLET_LIFETIME_TICKS,
  BULLET_RADIUS,
  BULLET_SPEED,
  FIRE_COOLDOWN_TICKS,
  MAX_BOUNCES,
  MAX_TICKS,
  SNAPSHOT_INTERVAL,
  TANK_MAX_HEALTH,
  TANK_RADIUS,
  TANK_REVERSE_SPEED,
  TANK_SPEED,
  TANK_TURN_SPEED
} from "./constants.js";
import { chooseCommands } from "./botInterpreter.js";
import type {
  ArenaMap,
  BotSensors,
  BulletState,
  EngineInput,
  MatchResult,
  MatchSnapshot,
  Rect,
  TankCommand,
  TankState,
  Vector2
} from "./types.js";

function length(vector: Vector2): number {
  return Math.sqrt((vector.x * vector.x) + (vector.y * vector.y));
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

function wallDistanceBand(tank: TankState, map: ArenaMap): "near" | "medium" | "far" {
  const distances = [
    tank.position.x,
    tank.position.y,
    map.width - tank.position.x,
    map.height - tank.position.y,
    ...map.walls.flatMap((wall) => {
      const centerX = clamp(tank.position.x, wall.x, wall.x + wall.width);
      const centerY = clamp(tank.position.y, wall.y, wall.y + wall.height);
      return [length({ x: tank.position.x - centerX, y: tank.position.y - centerY })];
    })
  ];
  const minDistance = Math.min(...distances);

  if (minDistance < 80) {
    return "near";
  }
  if (minDistance < 180) {
    return "medium";
  }
  return "far";
}

function distanceBand(distance: number): "near" | "medium" | "far" {
  if (distance < 150) {
    return "near";
  }
  if (distance < 360) {
    return "medium";
  }
  return "far";
}

function bulletThreat(tank: TankState, bullets: BulletState[]): boolean {
  return bullets.some((bullet) => {
    if (bullet.ownerTankId === tank.id) {
      return false;
    }

    const futurePosition = {
      x: bullet.position.x + (bullet.velocity.x * 8),
      y: bullet.position.y + (bullet.velocity.y * 8)
    };

    return length({
      x: futurePosition.x - tank.position.x,
      y: futurePosition.y - tank.position.y
    }) < 60;
  });
}

function healthBand(health: number): "near" | "medium" | "far" {
  if (health <= 1) {
    return "near";
  }
  if (health === 2) {
    return "medium";
  }
  return "far";
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

function computeSensors(
  tank: TankState,
  enemy: TankState,
  map: ArenaMap,
  bullets: BulletState[],
  stuckTimer: number
): BotSensors {
  const dx = enemy.position.x - tank.position.x;
  const dy = enemy.position.y - tank.position.y;
  const bearing = normalizeAngle(Math.atan2(dy, dx) - tank.rotation);

  return {
    enemyVisible: hasLineOfSight(tank.position, enemy.position, map.walls),
    enemyBearing: bearing,
    enemyDistanceBand: distanceBand(length({ x: dx, y: dy })),
    wallDistanceBand: wallDistanceBand(tank, map),
    bulletThreat: bulletThreat(tank, bullets),
    cooldownReady: tank.cooldownTicks === 0,
    stuckTimer,
    healthBand: healthBand(tank.health)
  };
}

function createBullet(tank: TankState, tick: number): BulletState {
  const direction = {
    x: Math.cos(tank.rotation),
    y: Math.sin(tank.rotation)
  };

  return {
    id: `${tank.id}-bullet-${tick}`,
    ownerTankId: tank.id,
    position: {
      x: tank.position.x + direction.x * (TANK_RADIUS + BULLET_RADIUS + 2),
      y: tank.position.y + direction.y * (TANK_RADIUS + BULLET_RADIUS + 2)
    },
    velocity: {
      x: direction.x * BULLET_SPEED,
      y: direction.y * BULLET_SPEED
    },
    remainingBounces: MAX_BOUNCES,
    ageTicks: 0
  };
}

function applyCommand(tank: TankState, command: TankCommand, map: ArenaMap): { fired: boolean; moved: boolean } {
  let fired = false;
  let moved = false;

  if (command === "turnLeft") {
    tank.rotation = normalizeAngle(tank.rotation - TANK_TURN_SPEED);
  } else if (command === "turnRight") {
    tank.rotation = normalizeAngle(tank.rotation + TANK_TURN_SPEED);
  } else if (command === "moveForward" || command === "moveBackward") {
    const speed = command === "moveForward" ? TANK_SPEED : -TANK_REVERSE_SPEED;
    const nextPosition = advancePosition(tank.position, tank.rotation, speed);
    if (!tankHitsWall(nextPosition, map)) {
      tank.position = nextPosition;
      moved = true;
    }
  } else if (command === "fire" && tank.cooldownTicks === 0) {
    fired = true;
    tank.cooldownTicks = FIRE_COOLDOWN_TICKS;
  }

  return { fired, moved };
}

function snapshotState(tick: number, tanks: TankState[], bullets: BulletState[]): MatchSnapshot {
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

export function simulateMatch(input: EngineInput): MatchResult {
  const map = input.map;
  const tanks = input.tanks.map((tank) => ({
    ...tank,
    position: { ...tank.position },
    commandQueue: [...tank.commandQueue],
    cooldownTicks: tank.cooldownTicks ?? 0,
    health: tank.health ?? TANK_MAX_HEALTH,
    pendingActionTicks: tank.pendingActionTicks ?? 0
  })) as [TankState, TankState];
  const bullets: BulletState[] = [];
  const replay: MatchSnapshot[] = [snapshotState(0, tanks, bullets)];
  const stuckTimers = new Map<string, number>();

  let finalTick = 0;

  for (let tick = 1; tick <= MAX_TICKS; tick += 1) {
    finalTick = tick;

    for (const tank of tanks) {
      if (tank.health <= 0) {
        continue;
      }

      if (tank.cooldownTicks > 0) {
        tank.cooldownTicks -= 1;
      }

      if (!tank.isManual && tank.bot) {
        const enemy = tanks.find((candidate) => candidate.id !== tank.id)!;
        const sensors = computeSensors(
          tank,
          enemy,
          map,
          bullets,
          stuckTimers.get(tank.id) ?? 0
        );

        if (tank.commandQueue.length === 0 || tank.pendingActionTicks <= 0) {
          tank.commandQueue = chooseCommands(tank.bot, sensors);
          tank.pendingActionTicks = 12;
        }
      }

      const command = tank.commandQueue[0] ?? "stop";
      const previousPosition = { ...tank.position };
      const { fired, moved } = applyCommand(tank, command, map);

      if (tank.commandQueue.length > 0) {
        tank.pendingActionTicks -= 1;
        if (tank.pendingActionTicks <= 0) {
          tank.commandQueue.shift();
          tank.pendingActionTicks = 0;
        }
      }

      if (fired) {
        bullets.push(createBullet(tank, tick));
      }

      const stuckTimer = moved
        ? 0
        : (stuckTimers.get(tank.id) ?? 0) + (previousPosition.x === tank.position.x && previousPosition.y === tank.position.y ? 1 : 0);
      stuckTimers.set(tank.id, stuckTimer);
    }

    for (let index = bullets.length - 1; index >= 0; index -= 1) {
      const bullet = bullets[index];
      bullet.ageTicks += 1;

      const bounced = bounceBullet(bullet, map);
      if (bounced && bullet.remainingBounces < 0) {
        bullets.splice(index, 1);
        continue;
      }

      if (bullet.ageTicks > BULLET_LIFETIME_TICKS) {
        bullets.splice(index, 1);
        continue;
      }

      const hitTank = tanks.find((tank) => tank.id !== bullet.ownerTankId && tank.health > 0 && tankHitByBullet(tank, bullet));
      if (hitTank) {
        hitTank.health -= 1;
        if (hitTank.health <= 0) {
          hitTank.eliminatedAtTick = tick;
        }
        bullets.splice(index, 1);
      }
    }

    if (tick % SNAPSHOT_INTERVAL === 0) {
      replay.push(snapshotState(tick, tanks, bullets));
    }

    const activeTanks = tanks.filter((tank) => tank.health > 0);
    if (activeTanks.length <= 1) {
      const finalState = snapshotState(tick, tanks, bullets);
      replay.push(finalState);
      return {
        mapId: map.id,
        totalTicks: tick,
        winnerTankId: activeTanks[0]?.id ?? null,
        reason: activeTanks.length === 1 ? "elimination" : "draw",
        replay,
        finalState
      };
    }
  }

  const [left, right] = tanks;
  let winnerTankId: string | null = null;
  if (left.health !== right.health) {
    winnerTankId = left.health > right.health ? left.id : right.id;
  }
  const finalState = snapshotState(finalTick, tanks, bullets);
  replay.push(finalState);

  return {
    mapId: map.id,
    totalTicks: finalTick,
    winnerTankId,
    reason: winnerTankId ? "timeout" : "draw",
    replay,
    finalState
  };
}

export function createInitialTankState(params: {
  id: string;
  name: string;
  position: Vector2;
  rotation: number;
  isManual: boolean;
  bot?: TankState["bot"];
}): TankState {
  return {
    id: params.id,
    name: params.name,
    position: params.position,
    rotation: params.rotation,
    health: TANK_MAX_HEALTH,
    cooldownTicks: 0,
    commandQueue: [],
    pendingActionTicks: 0,
    isManual: params.isManual,
    bot: params.bot
  };
}
