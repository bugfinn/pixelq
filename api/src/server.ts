import { buildApp } from "./app.js";
import { config } from "./config.js";
import { db, pool } from "./db.js";
import { createJobRepository } from "./job-repository.js";
import { runMigrations } from "./migrate.js";
import { imageQueue, redis } from "./queue.js";
import { startQueueEvents } from "./queue-events.js";
import { getQueueStats } from "./queue-stats.js";

const SHUTDOWN_TIMEOUT_MS = 8_000;

await runMigrations();

const app = buildApp({ repository: createJobRepository(db), queueStats: getQueueStats });
const queueEvents = startQueueEvents(app.log);

app.addHook("onClose", async () => {
  await queueEvents.close();
});

let shuttingDown = false;

async function shutdown(signal: string) {
  if (shuttingDown) {
    return;
  }
  shuttingDown = true;

  app.log.info({ signal }, "Shutting down");

  setTimeout(() => {
    app.log.error("Shutdown took too long, exiting now");
    process.exit(1);
  }, SHUTDOWN_TIMEOUT_MS).unref();

  try {
    await app.close();
    await imageQueue.close();
    redis.disconnect();
    await pool.end();
    process.exit(0);
  } catch (err) {
    app.log.error({ err }, "Error during shutdown");
    process.exit(1);
  }
}

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));

try {
  await app.listen({ port: config.port, host: config.host });
} catch (err) {
  app.log.error(err);
  process.exit(1);
}