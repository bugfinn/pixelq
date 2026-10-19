import {
  integer,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

export const jobStatus = pgEnum("job_status", [
  "queued",
  "processing",
  "done",
  "failed",
  "enqueue_failed",
]);

export const variantName = pgEnum("variant_name", ["thumbnail", "medium", "full"]);

export const jobs = pgTable("jobs", {
  id: uuid("id").primaryKey().defaultRandom(),
  originalName: text("original_name").notNull(),
  storedPath: text("stored_path").notNull(),
  originalSizeBytes: integer("original_size_bytes"),
  status: jobStatus("status").notNull().default("queued"),
  attempts: integer("attempts").notNull().default(0),
  error: text("error"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  startedAt: timestamp("started_at", { withTimezone: true }),
  finishedAt: timestamp("finished_at", { withTimezone: true }),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
});

export const outputs = pgTable(
  "outputs",
  {
    jobId: uuid("job_id")
      .notNull()
      .references(() => jobs.id, { onDelete: "cascade" }),
    variant: variantName("variant").notNull(),
    path: text("path").notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    width: integer("width").notNull(),
    height: integer("height").notNull(),
  },
  (table) => [primaryKey({ columns: [table.jobId, table.variant] })],
);
