import { resolve } from "node:path";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { db } from "./db.js";

export async function runMigrations() {
  await migrate(db, { migrationsFolder: resolve("drizzle") });
}