import { buildApp } from "./app";
import { loadAppConfig } from "../config/env";

async function start() {
  const config = loadAppConfig();
  const app = await buildApp();

  try {
    await app.listen({
      host: config.host,
      port: config.port,
    });
  } catch (error) {
    app.log.error(error);
    process.exit(1);
  }
}

void start();
