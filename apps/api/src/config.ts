import dotenv from "dotenv";

dotenv.config();

export function getConfig(): { port: number; mongoUri: string; jwtSecret: string } {
  return {
    port: Number(process.env.PORT ?? 4000),
    mongoUri: process.env.MONGO_URI ?? "mongodb://127.0.0.1:27017/tankbotbattle",
    jwtSecret: process.env.JWT_SECRET ?? "dev-secret"
  };
}
