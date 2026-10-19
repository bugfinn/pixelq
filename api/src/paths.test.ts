import { describe, expect, it } from "vitest";
import { isInside } from "./paths.js";

describe("isInside", () => {
  it("accepts a file inside the folder", () => {
    expect(isInside("/data/outputs", "/data/outputs/job/full.webp")).toBe(true);
  });

  it("rejects the folder itself", () => {
    expect(isInside("/data/outputs", "/data/outputs")).toBe(false);
  });

  it("rejects a path that climbs out with ..", () => {
    expect(isInside("/data/outputs", "/data/outputs/../secrets/key")).toBe(false);
  });

  it("rejects a sibling folder that only shares the name prefix", () => {
    expect(isInside("/data/outputs", "/data/outputs2/a.webp")).toBe(false);
  });

  it("rejects an unrelated absolute path", () => {
    expect(isInside("/data/outputs", "/etc/passwd")).toBe(false);
  });
});