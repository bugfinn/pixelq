import { pool } from "./db.js";
import { runMigrations } from "./migrate.js";

await runMigrations();
console.log("migrations applied");

await pool.end();