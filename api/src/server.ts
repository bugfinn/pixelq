import { buildApp } from "./app.js";
import { config } from "./config.js";
import { db } from "./db.js";
import { createJobRepository } from "./job-repository.js";
import { startQueueEvents } from "./queue-events.js";
import { getQueueStats } from "./queue-stats.js";

const app = buildApp({ repository: createJobRepository(db), queueStats: getQueueStats });
const queueEvents = startQueueEvents(app.log);

app.addHook("onClose", async () => {
  await queueEvents.close();
});

try {
  await app.listen({ port: config.port, host: config.host });
} catch (err) {
  app.log.error(err);
  process.exit(1);
}