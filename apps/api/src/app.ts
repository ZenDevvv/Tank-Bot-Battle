import cors from "cors";
import express from "express";
import {
  botDefinitionExample,
  botDefinitionJsonSchema,
  fixedMaps,
  validateBotDefinition
} from "@tank-bot-battle/shared";
import { createToken, hashPassword, requireAuth, verifyPassword, type AuthenticatedRequest } from "./auth.js";
import { connectDatabase } from "./db.js";
import { logEvent } from "./logger.js";
import { BotModel } from "./models/Bot.js";
import { MapModel } from "./models/Map.js";
import { MatchModel } from "./models/Match.js";
import { UserModel } from "./models/User.js";
import { seedStaticContent } from "./seed.js";

export const app = express();

app.use(cors());
app.use(express.json({ limit: "5mb" }));

app.get("/health", (_request, response) => {
  response.json({ ok: true });
});

app.post("/auth/register", async (request, response) => {
  const { username, email, password } = request.body as {
    username?: string;
    email?: string;
    password?: string;
  };

  if (!username || !email || !password || password.length < 8) {
    response.status(400).json({ message: "username, email, and password (min 8 chars) are required" });
    return;
  }

  const existing = await UserModel.findOne({
    $or: [{ username }, { email: email.toLowerCase() }]
  });

  if (existing) {
    response.status(409).json({ message: "User already exists" });
    return;
  }

  const user = await UserModel.create({
    username,
    email: email.toLowerCase(),
    passwordHash: await hashPassword(password)
  });

  response.status(201).json({
    token: createToken(user._id.toString()),
    user: {
      id: user._id.toString(),
      username: user.username,
      email: user.email
    }
  });
});

app.post("/auth/login", async (request, response) => {
  const { email, password } = request.body as { email?: string; password?: string };
  const user = email ? await UserModel.findOne({ email: email.toLowerCase() }) : null;

  if (!user || !password || !(await verifyPassword(password, user.passwordHash))) {
    response.status(401).json({ message: "Invalid credentials" });
    return;
  }

  response.json({
    token: createToken(user._id.toString()),
    user: {
      id: user._id.toString(),
      username: user.username,
      email: user.email
    }
  });
});

app.get("/auth/me", requireAuth, async (request: AuthenticatedRequest, response) => {
  const user = await UserModel.findById(request.userId).select("_id username email");
  if (!user) {
    response.status(404).json({ message: "User not found" });
    return;
  }
  response.json({
    id: user._id.toString(),
    username: user.username,
    email: user.email
  });
});

app.get("/schema/bot", (_request, response) => {
  response.json(botDefinitionJsonSchema);
});

app.get("/schema/bot/example", (_request, response) => {
  response.json(botDefinitionExample);
});

app.post("/bots/validate", (request, response) => {
  try {
    const definition = validateBotDefinition(request.body);
    response.json({ valid: true, definition });
  } catch (error) {
    response.status(400).json({
      valid: false,
      message: error instanceof Error ? error.message : "Invalid bot definition"
    });
  }
});

app.get("/maps", async (_request, response) => {
  const maps = await MapModel.find().sort({ name: 1 });
  response.json(maps.map((map) => ({
    id: map.mapId,
    name: map.name,
    width: map.width,
    height: map.height,
    spawnPoints: map.spawnPoints,
    walls: map.walls
  })));
});

app.get("/bots/public", async (_request, response) => {
  const bots = await BotModel.find({ isSystem: true }).sort({ name: 1 });

  response.json(bots.map((bot) => ({
    id: bot._id.toString(),
    ownerId: null,
    name: bot.name,
    version: bot.version,
    author: bot.author,
    isSystem: true,
    definition: bot.definition
  })));
});

app.get("/bots", requireAuth, async (request: AuthenticatedRequest, response) => {
  const bots = await BotModel.find({
    $or: [
      { ownerId: request.userId },
      { isSystem: true }
    ]
  }).sort({ isSystem: -1, createdAt: -1 });

  response.json(bots.map((bot) => ({
    id: bot._id.toString(),
    ownerId: bot.ownerId?.toString() ?? null,
    name: bot.name,
    version: bot.version,
    author: bot.author,
    isSystem: bot.isSystem,
    definition: bot.definition
  })));
});

app.post("/bots", requireAuth, async (request: AuthenticatedRequest, response) => {
  try {
    const definition = validateBotDefinition(request.body);
    const bot = await BotModel.create({
      ownerId: request.userId,
      name: definition.name,
      version: definition.version,
      author: definition.author,
      definition
    });

    response.status(201).json({
      id: bot._id.toString(),
      name: bot.name,
      version: bot.version,
      author: bot.author,
      definition: bot.definition
    });
  } catch (error) {
    response.status(400).json({
      message: error instanceof Error ? error.message : "Invalid bot definition"
    });
  }
});

app.get("/bots/:id", requireAuth, async (request: AuthenticatedRequest, response) => {
  const bot = await BotModel.findById(request.params.id);
  if (!bot || (!bot.isSystem && bot.ownerId?.toString() !== request.userId)) {
    response.status(404).json({ message: "Bot not found" });
    return;
  }

  response.json({
    id: bot._id.toString(),
    ownerId: bot.ownerId?.toString() ?? null,
    name: bot.name,
    version: bot.version,
    author: bot.author,
    isSystem: bot.isSystem,
    definition: bot.definition
  });
});

app.delete("/bots/:id", requireAuth, async (request: AuthenticatedRequest, response) => {
  const bot = await BotModel.findById(request.params.id);
  if (!bot || bot.isSystem || bot.ownerId?.toString() !== request.userId) {
    response.status(404).json({ message: "Bot not found" });
    return;
  }

  await bot.deleteOne();
  response.status(204).send();
});

app.post("/matches", requireAuth, async (request: AuthenticatedRequest, response) => {
  const { leftBotId, rightBotId, mapId, winnerTankId, reason, totalTicks, replay, finalState } = request.body as {
    leftBotId?: string;
    rightBotId?: string;
    mapId?: string;
    winnerTankId?: string | null;
    reason?: string;
    totalTicks?: number;
    replay?: unknown[];
    finalState?: unknown;
  };

  if (!leftBotId || !rightBotId || !mapId || !reason || typeof totalTicks !== "number" || !Array.isArray(replay) || !finalState) {
    response.status(400).json({ message: "leftBotId, rightBotId, mapId, reason, totalTicks, replay, and finalState are required" });
    return;
  }

  const [leftBot, rightBot, mapDoc] = await Promise.all([
    BotModel.findById(leftBotId),
    BotModel.findById(rightBotId),
    MapModel.findOne({ mapId })
  ]);

  if (!leftBot || !rightBot || !mapDoc) {
    response.status(404).json({ message: "Bot or map not found" });
    return;
  }

  const allowedBots = [leftBot, rightBot].every((bot) => bot.isSystem || bot.ownerId?.toString() === request.userId);
  if (!allowedBots) {
    response.status(403).json({ message: "You may only use your own bots or system bots" });
    return;
  }

  if (!fixedMaps.some((candidate) => candidate.id === mapDoc.mapId)) {
    response.status(404).json({ message: "Map definition missing" });
    return;
  }

  const match = await MatchModel.create({
    ownerId: request.userId,
    leftBotId,
    rightBotId,
    mapId,
    winnerTankId: winnerTankId ?? null,
    reason,
    totalTicks,
    replay,
    finalState
  });

  logEvent("match.completed", {
    matchId: match._id.toString(),
    winnerTankId: winnerTankId ?? null,
    totalTicks,
    mapId
  });

  response.status(201).json({
    id: match._id.toString(),
    winnerTankId: winnerTankId ?? null,
    reason,
    totalTicks,
    replayLength: replay.length
  });
});

app.get("/matches", requireAuth, async (request: AuthenticatedRequest, response) => {
  const matches = await MatchModel.find({ ownerId: request.userId }).sort({ createdAt: -1 }).limit(25);
  response.json(matches.map((match) => ({
    id: match._id.toString(),
    leftBotId: match.leftBotId.toString(),
    rightBotId: match.rightBotId.toString(),
    mapId: match.mapId,
    winnerTankId: match.winnerTankId,
    reason: match.reason,
    totalTicks: match.totalTicks,
    createdAt: match.createdAt
  })));
});

app.get("/matches/:id", requireAuth, async (request: AuthenticatedRequest, response) => {
  const match = await MatchModel.findOne({ _id: request.params.id, ownerId: request.userId });
  if (!match) {
    response.status(404).json({ message: "Match not found" });
    return;
  }

  response.json({
    id: match._id.toString(),
    mapId: match.mapId,
    winnerTankId: match.winnerTankId,
    reason: match.reason,
    totalTicks: match.totalTicks,
    finalState: match.finalState
  });
});

app.get("/matches/:id/replay", requireAuth, async (request: AuthenticatedRequest, response) => {
  const match = await MatchModel.findOne({ _id: request.params.id, ownerId: request.userId });
  if (!match) {
    response.status(404).json({ message: "Match not found" });
    return;
  }

  response.json({
    id: match._id.toString(),
    replay: match.replay
  });
});

app.use((error: unknown, _request: express.Request, response: express.Response, _next: express.NextFunction) => {
  response.status(500).json({
    message: error instanceof Error ? error.message : "Unexpected server error"
  });
});

export async function prepareApp(): Promise<void> {
  await connectDatabase();
  await seedStaticContent();
}
