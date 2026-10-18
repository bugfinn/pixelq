import { buildApp } from "./app.js";
import { config } from "./config.js";
import { startQueueEvents } from "./queue-events.js";

const app = buildApp();
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