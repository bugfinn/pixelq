function readPort(value: string | undefined): number {
  const raw = value ?? "3000";
  const port = Number(raw);

  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`Invalid PORT "${raw}". Use a whole number from 1 to 65535.`);
  }

  return port;
}

function readDatabaseUrl(value: string | undefined): string {
  if (!value) {
    throw new Error(
      "DATABASE_URL is not set. Example: postgres://user:password@127.0.0.1:5432/dbname",
    );
  }

  let protocol: string;
  try {
    protocol = new URL(value).protocol;
  } catch {
    throw new Error("DATABASE_URL is not a valid URL.");
  }

  if (protocol !== "postgres:" && protocol !== "postgresql:") {
    throw new Error("DATABASE_URL must start with postgres:// or postgresql://");
  }

  return value;
}

export const config = {
  port: readPort(process.env.PORT),
  host: process.env.HOST ?? "0.0.0.0",
  databaseUrl: readDatabaseUrl(process.env.DATABASE_URL),
};
