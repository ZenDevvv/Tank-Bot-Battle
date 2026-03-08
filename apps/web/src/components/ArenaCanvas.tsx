import { useEffect, useRef, useState } from "react";
import { TANK_MAX_HEALTH, fixedMaps, type ImpactEffect, type MatchSnapshot } from "@tank-bot-battle/shared";
import { resolveBattlefieldTickInterval } from "../lib/battlefieldSpeed";
import type { MapRecord, ReplaySpeed } from "../types";

type ArenaCanvasProps = {
  replay: MatchSnapshot[];
  mapId: string;
  mode: "live" | "replay";
  isPlaying?: boolean;
  playbackSpeed?: ReplaySpeed;
  playbackToken?: number;
  fixedFrameIndex?: number;
  theme?: "live" | "replay";
  onPlaybackComplete?: () => void;
};

function resolveMap(mapId: string): MapRecord {
  const map = fixedMaps.find((candidate) => candidate.id === mapId) ?? fixedMaps[0];
  return {
    id: map.id,
    name: map.name,
    width: map.width,
    height: map.height,
    spawnPoints: map.spawnPoints,
    walls: map.walls
  };
}

function clampFrameIndex(index: number, frameCount: number): number {
  if (frameCount <= 1) {
    return 0;
  }

  return Math.max(0, Math.min(index, frameCount - 1));
}

function isTankHitEffect(effect: ImpactEffect): effect is Extract<ImpactEffect, { kind: "tankHit" }> {
  return effect.kind === "tankHit";
}

function drawHeart(context: CanvasRenderingContext2D, x: number, y: number, size: number): void {
  const topCurveHeight = size * 0.3;

  context.beginPath();
  context.moveTo(x, y + (size * 0.25));
  context.bezierCurveTo(x, y, x - (size * 0.5), y, x - (size * 0.5), y + topCurveHeight);
  context.bezierCurveTo(x - (size * 0.5), y + (size * 0.6), x, y + (size * 0.8), x, y + size);
  context.bezierCurveTo(x, y + (size * 0.8), x + (size * 0.5), y + (size * 0.6), x + (size * 0.5), y + topCurveHeight);
  context.bezierCurveTo(x + (size * 0.5), y, x, y, x, y + (size * 0.25));
  context.closePath();
}

function drawTankHitBurst(
  context: CanvasRenderingContext2D,
  position: { x: number; y: number },
  progress: number,
  theme: "live" | "replay"
): void {
  const baseRadius = 18 + (progress * 14);

  context.save();
  context.globalAlpha = 0.34 * (1 - progress);
  context.beginPath();
  context.fillStyle = theme === "replay" ? "#ffd166" : "#ff9f68";
  context.arc(position.x, position.y, baseRadius, 0, Math.PI * 2);
  context.fill();

  context.globalAlpha = 0.22 * (1 - progress);
  context.beginPath();
  context.fillStyle = "#fff4b3";
  context.arc(position.x, position.y, baseRadius * 0.62, 0, Math.PI * 2);
  context.fill();
  context.restore();
}

function drawTankDissolve(
  context: CanvasRenderingContext2D,
  position: { x: number; y: number },
  progress: number,
  tint: string
): void {
  const shards = [
    { x: -18, y: -12 },
    { x: -10, y: 10 },
    { x: 2, y: -16 },
    { x: 12, y: 6 },
    { x: 18, y: -4 }
  ];

  context.save();
  context.globalAlpha = 0.46 * (1 - progress);
  context.fillStyle = tint;
  for (const shard of shards) {
    context.fillRect(
      position.x + shard.x + (shard.x * progress * 0.45),
      position.y + shard.y - (progress * 8),
      4,
      4
    );
  }
  context.restore();
}

export function ArenaCanvas({
  replay,
  mapId,
  mode,
  isPlaying = false,
  playbackSpeed = 1,
  playbackToken = 0,
  fixedFrameIndex,
  theme = "live",
  onPlaybackComplete
}: ArenaCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const completionNotifiedRef = useRef(false);
  const playbackResetPendingRef = useRef(false);
  const [frameIndex, setFrameIndex] = useState(0);

  useEffect(() => {
    completionNotifiedRef.current = false;
    playbackResetPendingRef.current = true;
    setFrameIndex(clampFrameIndex(fixedFrameIndex ?? 0, replay.length));
  }, [replay, mapId, playbackToken, fixedFrameIndex]);

  useEffect(() => {
    if (mode !== "replay" || fixedFrameIndex !== undefined) {
      playbackResetPendingRef.current = false;
      return;
    }

    if (frameIndex === 0) {
      playbackResetPendingRef.current = false;
    }
  }, [fixedFrameIndex, frameIndex, mode]);

  useEffect(() => {
    if (fixedFrameIndex !== undefined || mode !== "replay" || !isPlaying || replay.length < 2) {
      return;
    }

    if (playbackResetPendingRef.current) {
      return;
    }

    if (frameIndex >= replay.length - 1) {
      if (!completionNotifiedRef.current) {
        completionNotifiedRef.current = true;
        onPlaybackComplete?.();
      }
      return;
    }

    const timer = window.setTimeout(() => {
      setFrameIndex((current) => clampFrameIndex(current + 1, replay.length));
    }, resolveBattlefieldTickInterval(playbackSpeed));

    return () => window.clearTimeout(timer);
  }, [fixedFrameIndex, frameIndex, isPlaying, mode, onPlaybackComplete, playbackSpeed, replay.length]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context || replay.length === 0) {
      return;
    }

    const map = resolveMap(mapId);
    const displayIndex = clampFrameIndex(fixedFrameIndex ?? frameIndex, replay.length);
    const frame = replay[displayIndex];
    const effects = frame.effects ?? [];
    const tankHitEffects = new Map(
      effects
        .filter(isTankHitEffect)
        .map((effect) => [effect.tankId, effect])
    );

    context.clearRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = theme === "replay" ? "#0f182a" : "#11213a";
    context.fillRect(0, 0, canvas.width, canvas.height);

    context.fillStyle = theme === "replay" ? "#416380" : "#305b80";
    for (const wall of map.walls) {
      context.fillRect(wall.x, wall.y, wall.width, wall.height);
    }

    for (const bullet of frame.bullets) {
      context.beginPath();
      context.fillStyle = "#ffd76a";
      context.arc(bullet.position.x, bullet.position.y, 5, 0, Math.PI * 2);
      context.fill();
    }

    for (const effect of effects) {
      if (effect.kind === "bulletClash") {
        const progress = effect.durationTicks === 0 ? 1 : effect.ageTicks / effect.durationTicks;
        const radius = 8 + (progress * 12);

        context.save();
        context.globalAlpha = 1 - progress;
        context.beginPath();
        context.fillStyle = "#fff4b3";
        context.arc(effect.position.x, effect.position.y, 4 + (progress * 4), 0, Math.PI * 2);
        context.fill();
        context.beginPath();
        context.strokeStyle = "#ffb703";
        context.lineWidth = 2;
        context.arc(effect.position.x, effect.position.y, radius, 0, Math.PI * 2);
        context.stroke();
        context.restore();
      }
    }

    for (const tank of frame.tanks) {
      const hitEffect = tankHitEffects.get(tank.id);
      const hitProgress = hitEffect ? (hitEffect.ageTicks / hitEffect.durationTicks) : 1;
      const hitActive = hitEffect !== undefined && hitProgress < 1;
      const tankTint = tank.id === "left" || tank.id === "player" ? "#fb6f92" : "#52b788";

      if (hitActive && hitEffect) {
        drawTankHitBurst(context, tank.position, hitProgress, theme);
      }

      context.save();
      context.translate(tank.position.x, tank.position.y);
      context.rotate(tank.rotation);
      if (hitActive) {
        context.globalAlpha = 0.72 - (hitProgress * 0.22);
      }
      context.fillStyle = tankTint;
      context.fillRect(-20, -14, 40, 28);
      context.fillStyle = "#f8f9fa";
      context.fillRect(0, -4, 24, 8);
      context.restore();

      if (hitActive) {
        drawTankDissolve(context, tank.position, hitProgress, tankTint);
      }

      const nameY = tank.position.y - 32;
      const heartsY = tank.position.y - 56;
      const heartSpacing = 16;
      const heartStartX = tank.position.x - (((TANK_MAX_HEALTH - 1) * heartSpacing) / 2);

      context.fillStyle = "#f1f5f9";
      context.font = "12px 'Space Grotesk', sans-serif";
      context.textAlign = "center";
      context.fillText(tank.name, tank.position.x, nameY);

      for (let index = 0; index < tank.health; index += 1) {
        context.save();
        context.fillStyle = "#ff6b81";
        context.globalAlpha = 0.95;
        drawHeart(context, heartStartX + (index * heartSpacing), heartsY, 10);
        context.fill();
        context.restore();
      }

      if (hitActive && hitEffect) {
        const lostHeartIndex = hitEffect.remainingHealth;
        if (lostHeartIndex < TANK_MAX_HEALTH) {
          context.save();
          context.translate(0, -(hitProgress * 6));
          context.globalAlpha = 0.82 * (1 - hitProgress);
          context.fillStyle = "#ff9f68";
          drawHeart(context, heartStartX + (lostHeartIndex * heartSpacing), heartsY, 10 + (hitProgress * 3));
          context.fill();
          context.restore();
        }
      }
    }
  }, [fixedFrameIndex, frameIndex, mapId, replay, theme]);

  const displayIndex = replay.length === 0 ? 0 : clampFrameIndex(fixedFrameIndex ?? frameIndex, replay.length);

  return (
    <div className={theme === "replay" ? "arena-shell replay-theme" : "arena-shell"} data-mode={mode}>
      <div className="arena-canvas-frame">
        <canvas ref={canvasRef} width={960} height={640} aria-label="Tank battle replay canvas" />
      </div>
      <div className="arena-meta">
        <span>{theme === "replay" ? "Replay Feed" : "Live Feed"}: {resolveMap(mapId).name}</span>
        <span>Frame: {Math.min(displayIndex + 1, replay.length)} / {replay.length}</span>
      </div>
    </div>
  );
}
