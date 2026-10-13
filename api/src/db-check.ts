import { sql } from "drizzle-orm";
import { db, pool } from "./db.js";

const result = await db.execute(
  sql`select current_user as user, current_database() as database, version() as version`,
);
console.log(result.rows[0]);

await pool.end();
