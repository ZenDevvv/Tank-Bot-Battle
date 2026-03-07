import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import request from "supertest";
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

  it("creates matches and returns replay access", async () => {
    const bots = await request(app)
      .get("/bots")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);
    const maps = await request(app).get("/maps").expect(200);

    const systemBot = bots.body.find((bot: { isSystem: boolean }) => bot.isSystem);
    const match = await request(app)
      .post("/matches")
      .set("Authorization", `Bearer ${token}`)
      .send({
        leftBotId: createdBotId,
        rightBotId: systemBot.id,
        mapId: maps.body[0].id
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
