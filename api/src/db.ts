import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import { config } from "./config.js";

export const pool = new pg.Pool({ connectionString: config.databaseUrl });
export const db = drizzle({ client: pool });
