import { migrate } from "drizzle-orm/node-postgres/migrator";
import { db, pool } from "./db.js";

await migrate(db, { migrationsFolder: "./drizzle" });
console.log("migrations applied");

await pool.end();
