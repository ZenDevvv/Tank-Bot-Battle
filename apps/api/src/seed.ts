import { botDefinitionExample, fixedMaps } from "@tank-bot-battle/shared";
import { BotModel } from "./models/Bot.js";
import { MapModel } from "./models/Map.js";

export async function seedStaticContent(): Promise<void> {
  for (const map of fixedMaps) {
    await MapModel.updateOne(
      { mapId: map.id },
      {
        mapId: map.id,
        name: map.name,
        width: map.width,
        height: map.height,
        spawnPoints: map.spawnPoints,
        walls: map.walls
      },
      { upsert: true }
    );
  }

  await BotModel.updateOne(
    { isSystem: true, name: botDefinitionExample.name },
    {
      isSystem: true,
      name: botDefinitionExample.name,
      version: botDefinitionExample.version,
      author: botDefinitionExample.author,
      definition: botDefinitionExample
    },
    { upsert: true }
  );
}
