import { app, prepareApp } from "./app.js";
import { getConfig } from "./config.js";

async function start(): Promise<void> {
  const config = getConfig();
  await prepareApp();
  app.listen(config.port, () => {
    console.log(`Tank Bot Battle API listening on ${config.port}`);
  });
}

start().catch((error) => {
  console.error(error);
  process.exit(1);
});
