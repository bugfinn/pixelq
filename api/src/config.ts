function readPort(value: string | undefined): number {
  const raw = value ?? "3000";
  const port = Number(raw);

  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`Invalid PORT "${raw}". Use a whole number from 1 to 65535.`);
  }

  return port;
}

export const config = {
  port: readPort(process.env.PORT),
  host: process.env.HOST ?? "0.0.0.0",
};
