import { useEffect, useRef, useState } from "react";
import { fixedMaps, type MatchSnapshot } from "@tank-bot-battle/shared";
import type { MapRecord } from "../types";

type ArenaCanvasProps = {
  replay: MatchSnapshot[];
  mapId: string;
  autoplay?: boolean;
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

export function ArenaCanvas({ replay, mapId, autoplay = true }: ArenaCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [frameIndex, setFrameIndex] = useState(0);

  useEffect(() => {
    setFrameIndex(0);
  }, [replay, mapId]);

  useEffect(() => {
    if (!autoplay || replay.length < 2) {
      return;
    }

    const timer = window.setInterval(() => {
      setFrameIndex((current) => (current + 1) % replay.length);
    }, 90);

    return () => window.clearInterval(timer);
  }, [autoplay, replay]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context || replay.length === 0) {
      return;
    }

    const map = resolveMap(mapId);
    const frame = replay[Math.min(frameIndex, replay.length - 1)];
    const effects = frame.effects ?? [];

    context.clearRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = "#11213a";
    context.fillRect(0, 0, canvas.width, canvas.height);

    context.fillStyle = "#305b80";
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

    for (const tank of frame.tanks) {
      context.save();
      context.translate(tank.position.x, tank.position.y);
      context.rotate(tank.rotation);
      context.fillStyle = tank.id === "left" || tank.id === "player" ? "#fb6f92" : "#52b788";
      context.fillRect(-20, -14, 40, 28);
      context.fillStyle = "#f8f9fa";
      context.fillRect(0, -4, 24, 8);
      context.restore();

      context.fillStyle = "#f1f5f9";
      context.font = "12px 'Space Grotesk', sans-serif";
      context.fillText(`${tank.name} (${tank.health})`, tank.position.x - 24, tank.position.y - 26);
    }
  }, [frameIndex, mapId, replay]);

  return (
    <div className="arena-shell">
      <canvas ref={canvasRef} width={960} height={640} aria-label="Tank battle replay canvas" />
      <div className="arena-meta">
        <span>Map: {resolveMap(mapId).name}</span>
        <span>Frame: {Math.min(frameIndex + 1, replay.length)} / {replay.length}</span>
      </div>
    </div>
  );
}
