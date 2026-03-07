import mongoose from "mongoose";
import { getConfig } from "./config.js";

let connected = false;

export async function connectDatabase(uri = getConfig().mongoUri): Promise<void> {
  if (connected) {
    return;
  }

  await mongoose.connect(uri);
  connected = true;
}

export async function disconnectDatabase(): Promise<void> {
  if (!connected) {
    return;
  }

  await mongoose.disconnect();
  connected = false;
}
