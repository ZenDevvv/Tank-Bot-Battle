import { ARENA_HEIGHT, ARENA_WIDTH } from "./constants.js";
import type { ArenaMap } from "./types.js";

export const fixedMaps: ArenaMap[] = [
  {
    id: "crossfire",
    name: "Crossfire",
    width: ARENA_WIDTH,
    height: ARENA_HEIGHT,
    spawnPoints: [
      { x: 110, y: 110 },
      { x: 850, y: 530 }
    ],
    walls: [
      { x: 220, y: 120, width: 40, height: 400 },
      { x: 700, y: 120, width: 40, height: 400 },
      { x: 360, y: 80, width: 240, height: 40 },
      { x: 360, y: 520, width: 240, height: 40 },
      { x: 450, y: 210, width: 60, height: 220 }
    ]
  },
  {
    id: "pinball",
    name: "Pinball Maze",
    width: ARENA_WIDTH,
    height: ARENA_HEIGHT,
    spawnPoints: [
      { x: 120, y: 540 },
      { x: 840, y: 110 }
    ],
    walls: [
      { x: 180, y: 130, width: 600, height: 30 },
      { x: 180, y: 480, width: 600, height: 30 },
      { x: 280, y: 220, width: 30, height: 210 },
      { x: 650, y: 220, width: 30, height: 210 },
      { x: 420, y: 220, width: 120, height: 30 },
      { x: 420, y: 400, width: 120, height: 30 }
    ]
  }
];
