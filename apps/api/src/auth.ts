import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import type { NextFunction, Request, Response } from "express";
import { getConfig } from "./config.js";

export type AuthenticatedRequest = Request & {
  userId?: string;
};

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export function createToken(userId: string): string {
  return jwt.sign({ sub: userId }, getConfig().jwtSecret, { expiresIn: "7d" });
}

export function requireAuth(request: AuthenticatedRequest, response: Response, next: NextFunction): void {
  const header = request.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    response.status(401).json({ message: "Missing bearer token" });
    return;
  }

  try {
    const token = header.slice("Bearer ".length);
    const payload = jwt.verify(token, getConfig().jwtSecret) as { sub: string };
    request.userId = payload.sub;
    next();
  } catch {
    response.status(401).json({ message: "Invalid token" });
  }
}
