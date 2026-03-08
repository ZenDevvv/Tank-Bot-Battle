import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import request from "supertest";
import { botDefinitionExample, type MatchSnapshot } from "@tank-bot-battle/shared";
import { app, prepareApp } from "./app.js";
import { disconnectDatabase } from "./db.js";

describe("api app", () => {
  let mongoServer: MongoMemoryServer;
  let token: string;
  let createdBotId: string;

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    process.env.MONGO_URI = mongoServer.getUri();
    process.env.JWT_SECRET = "test-secret";
    await disconnectDatabase();
    await mongoose.disconnect();
    await prepareApp();
  });

  afterAll(async () => {
    await disconnectDatabase();
    await mongoServer.stop();
  });

  it("registers and authenticates a user", async () => {
    const register = await request(app)
      .post("/auth/register")
      .send({
        username: "pilot",
        email: "pilot@example.com",
        password: "Password123!"
      })
      .expect(201);

    token = register.body.token;
    expect(register.body.user.username).toBe("pilot");

    await request(app)
      .get("/auth/me")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);
  });

  it("validates and stores bot definitions", async () => {
    const example = await request(app).get("/schema/bot/example").expect(200);
    expect(example.body.stats).toEqual(botDefinitionExample.stats);
    await request(app)
      .post("/bots/validate")
      .send(example.body)
      .expect(200);

    const create = await request(app)
      .post("/bots")
      .set("Authorization", `Bearer ${token}`)
      .send(example.body)
      .expect(201);

    createdBotId = create.body.id;
    expect(create.body.name).toBe(example.body.name);
  });

  it("rejects bot stats that break the 300-point budget", async () => {
    const invalidBot = {
      ...botDefinitionExample,
      stats: {
        ...botDefinitionExample.stats,
        forwardSpeed: botDefinitionExample.stats.forwardSpeed + 1
      }
    };

    const response = await request(app)
      .post("/bots/validate")
      .send(invalidBot)
      .expect(400);

    expect(response.body.message).toMatch(/300/i);
  });

  it("returns only system bots from the public roster endpoint", async () => {
    const response = await request(app)
      .get("/bots/public")
      .expect(200);

    expect(response.body).toHaveLength(2);
    expect(response.body.every((bot: { isSystem: boolean; ownerId: string | null; id: string }) => bot.isSystem && bot.ownerId === null)).toBe(true);
    expect(response.body.some((bot: { id: string }) => bot.id === createdBotId)).toBe(false);
  });

  it("creates matches and returns replay access", async () => {
    const bots = await request(app)
      .get("/bots")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);
    const maps = await request(app).get("/maps").expect(200);

    const systemBot = bots.body.find((bot: { isSystem: boolean }) => bot.isSystem);
    const replay: MatchSnapshot[] = [
      {
        tick: 0,
        tanks: [
          {
            id: "left",
            name: "Client Bot",
            position: { x: 110, y: 110 },
            rotation: 0,
            health: 3,
            cooldownTicks: 0
          },
          {
            id: "right",
            name: "System Bot",
            position: { x: 850, y: 530 },
            rotation: Math.PI,
            health: 3,
            cooldownTicks: 0
          }
        ],
        bullets: [],
        effects: []
      },
      {
        tick: 1,
        tanks: [
          {
            id: "left",
            name: "Client Bot",
            position: { x: 114, y: 110 },
            rotation: 0.08,
            health: 3,
            cooldownTicks: 23
          },
          {
            id: "right",
            name: "System Bot",
            position: { x: 846, y: 530 },
            rotation: Math.PI - 0.08,
            health: 2,
            cooldownTicks: 0
          }
        ],
        bullets: [],
        effects: []
      }
    ];
    const finalState = replay[replay.length - 1];

    const match = await request(app)
      .post("/matches")
      .set("Authorization", `Bearer ${token}`)
      .send({
        leftBotId: createdBotId,
        rightBotId: systemBot.id,
        mapId: maps.body[0].id,
        winnerTankId: "left",
        reason: "elimination",
        totalTicks: finalState.tick,
        replay,
        finalState
      })
      .expect(201);

    const list = await request(app)
      .get("/matches")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);

    expect(list.body[0].id).toBe(match.body.id);

    await request(app)
      .get(`/matches/${match.body.id}/replay`)
      .set("Authorization", `Bearer ${token}`)
      .expect(200);
  });
});
