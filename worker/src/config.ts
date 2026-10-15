function readRedisUrl(value: string | undefined): string {
  if (!value) {
    throw new Error("REDIS_URL is not set. Example: redis://127.0.0.1:6379");
  }

  let protocol: string;
  try {
    protocol = new URL(value).protocol;
  } catch {
    throw new Error("REDIS_URL is not a valid URL.");
  }

  if (protocol !== "redis:" && protocol !== "rediss:") {
    throw new Error("REDIS_URL must start with redis:// or rediss://");
  }

  return value;
}

export const config = {
  redisUrl: readRedisUrl(process.env.REDIS_URL),
};
